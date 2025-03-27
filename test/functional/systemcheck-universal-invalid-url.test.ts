import path from 'path';
import { axiosClient } from '../setup/axios-client';
import { BrokerClient, closeBrokerClient } from '../setup/broker-client';
import {
  BrokerServer,
  closeBrokerServer,
  createBrokerServer,
  waitForUniversalBrokerClientsConnection,
} from '../setup/broker-server';
import { TestWebServer, createTestWebServer } from '../setup/test-web-server';
import { createUniversalBrokerClient } from '../setup/broker-universal-client';
import nock from 'nock';

const fixtures = path.resolve(__dirname, '..', 'fixtures');
const serverAccept = path.join(fixtures, 'server', 'filters.json');
const clientAccept = path.join(fixtures, 'client', 'filters.json');

describe('broker client systemcheck endpoint', () => {
  let tws: TestWebServer;
  let bs: BrokerServer;
  let bc: BrokerClient;

  beforeAll(async () => {
    tws = await createTestWebServer();
    // bs = await createBrokerServer({ filters: serverAccept });
    process.env.SKIP_REMOTE_CONFIG = 'true';
    nock(`https://snyk.io`)
      .persist()
      .get('/no-such-url-ever')
      .reply(() => {
        return [308, '/no-such-url-ever/'];
      });
  });

  afterAll(async () => {
    await tws.server.close();
    // await closeBrokerServer(bs);
    delete process.env.BROKER_SERVER_URL;
    delete process.env.SKIP_REMOTE_CONFIG;
  });

  beforeEach(async () => {
    bs = await createBrokerServer({ filters: serverAccept });
  });
  afterEach(async () => {
    await closeBrokerClient(bc);
    await closeBrokerServer(bs);
    delete process.env.SNYK_BROKER_SERVER_UNIVERSAL_CONFIG_ENABLED;
    delete process.env.UNIVERSAL_BROKER_ENABLED;
    delete process.env.SERVICE_ENV;
    delete process.env.BROKER_TOKEN_1;
    delete process.env.BROKER_TOKEN_2;
    delete process.env.BROKER_TOKEN_3;
    delete process.env.BROKER_TOKEN_4;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITLAB_TOKEN;
    delete process.env.BROKER_HEALTHCHECK_PATH;

    delete process.env
      .SNYK_BROKER_CLIENT_CONFIGURATION__common__default__BROKER_SERVER_URL;
    delete process.env.SNYK_FILTER_RULES_PATHS__github;
    delete process.env.SNYK_FILTER_RULES_PATHS__gitlab;
  });

  it('invalid validation url', async () => {
    process.env.SNYK_BROKER_SERVER_UNIVERSAL_CONFIG_ENABLED = 'true';
    process.env.UNIVERSAL_BROKER_ENABLED = 'true';
    process.env.SERVICE_ENV = 'universaltest2';
    process.env.BROKER_TOKEN_1 = 'brokertoken1';
    process.env.BROKER_TOKEN_2 = 'brokertoken2';
    process.env.BROKER_TOKEN_3 = 'brokertoken3';
    process.env.BROKER_TOKEN_4 = 'brokertoken4';
    process.env.JIRA_PAT = 'jirapat';
    process.env.JIRA_HOSTNAME = 'notexists.notexists';
    process.env.GITHUB_TOKEN = 'ghtoken';
    process.env.GITLAB_TOKEN = 'gltoken';
    process.env.CLIENT_ID = 'clienid';
    process.env.CLIENT_SECRET = 'clientsecret';

    process.env.SNYK_BROKER_CLIENT_CONFIGURATION__common__default__BROKER_SERVER_URL = `http://localhost:${bs.port}`;
    process.env.SNYK_FILTER_RULES_PATHS__github = clientAccept;
    process.env.SNYK_FILTER_RULES_PATHS__gitlab = clientAccept;
    bc = await createUniversalBrokerClient();
    await waitForUniversalBrokerClientsConnection(bs, 2);
    const response = await axiosClient.get(
      `http://localhost:${bc.port}/systemcheck`,
      { timeout: 10_000 },
    );

    expect(response.data).toBeInstanceOf(Array);
    const systemCheckBody = response.data;
    expect(response.status).toEqual(500);
    expect(systemCheckBody).toMatchObject([
      {
        connectionName: 'my github connection',
        results: [
          {
            data: {
              code: 'ENOTFOUND',
              errno: -3008,
              hostname: 'notexists.notexists',
              syscall: 'getaddrinfo',
            },
            url: 'https://notexists.notexists/no-such-url-ever',
          },
        ],
        validated: false,
        message:
          'Validation failed, please review connection details for my github connection.',
      },
      {
        connectionName: 'my gitlab connection',
        results: [
          {
            data: {
              code: 'ENOTFOUND',
              errno: -3008,
              hostname: 'notexists.notexists',
              syscall: 'getaddrinfo',
            },
            url: 'https://notexists.notexists/no-such-url-ever',
          },
        ],
        validated: false,
        message:
          'Validation failed, please review connection details for my gitlab connection.',
      },
    ]);
    delete process.env.CLIENT_ID;
    delete process.env.CLIENT_SECRET;
  });
});
