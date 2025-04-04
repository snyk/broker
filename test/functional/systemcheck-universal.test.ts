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

  it('good validation url, custom endpoint, no authorization', async () => {
    process.env.SNYK_BROKER_SERVER_UNIVERSAL_CONFIG_ENABLED = 'true';
    process.env.UNIVERSAL_BROKER_ENABLED = 'true';
    process.env.SERVICE_ENV = 'universaltest';
    process.env.BROKER_TOKEN_1 = 'brokertoken1';
    process.env.BROKER_TOKEN_2 = 'brokertoken2';
    process.env.BROKER_TOKEN_3 = 'brokertoken3';
    process.env.BROKER_TOKEN_4 = 'brokertoken4';
    process.env.JIRA_PAT = 'jirapat';
    process.env.JIRA_HOSTNAME = 'hostname';
    process.env.GITHUB_TOKEN = 'ghtoken';
    process.env.GITLAB_TOKEN = 'gltoken';
    process.env.BROKER_HEALTHCHECK_PATH = '/custom-systemcheck';
    process.env.AZURE_REPOS_TOKEN = '123';
    process.env.AZURE_REPOS_HOST = 'hostname';
    process.env.AZURE_REPOS_ORG = 'org';
    process.env.CLIENT_ID = 'clienid';
    process.env.CLIENT_SECRET = 'clientsecret';

    process.env.SNYK_BROKER_CLIENT_CONFIGURATION__common__default__BROKER_SERVER_URL = `http://localhost:${bs.port}`;
    process.env.SNYK_FILTER_RULES_PATHS__github = clientAccept;
    process.env.SNYK_FILTER_RULES_PATHS__gitlab = clientAccept;
    bc = await createUniversalBrokerClient();
    await waitForUniversalBrokerClientsConnection(bs, 2);

    const response = await axiosClient.get(
      `http://localhost:${bc.port}/custom-systemcheck`,
    );
    expect(response.data).toBeInstanceOf(Array);
    const systemCheckBody = response.data[0];
    expect(response.status).toEqual(200);
    expect(systemCheckBody).toEqual(
      expect.objectContaining({
        brokerServerUrl: 'http://localhost:9500/?connection_role=primary',
        friendlyName: 'my github connection',
        identifier: 'brok-...-ken1',
        ok: true,
        version: 'local',
        websocketConnectionOpen: true,
      }),
    );
    delete process.env.CLIENT_ID;
    delete process.env.CLIENT_SECRET;
  });

  it('should sanitise validation url (artifactory, nexus, nexus2)', async () => {
    process.env.SNYK_BROKER_SERVER_UNIVERSAL_CONFIG_ENABLED = 'true';
    process.env.UNIVERSAL_BROKER_ENABLED = 'true';
    process.env.SERVICE_ENV = 'universaltest8';
    process.env.BROKER_TOKEN_1 = 'brokertoken1';
    process.env.BROKER_TOKEN_2 = 'brokertoken2';
    process.env.BROKER_TOKEN_3 = 'brokertoken3';
    process.env.CLIENT_ID = 'clienid';
    process.env.CLIENT_SECRET = 'clientsecret';
    process.env.MY_ARTIFACTORY_URL = 'user:name@artifactory.local/artifactory';
    process.env.MY_BASE_NEXUS_URL = 'user:name@nexus.local';
    process.env.MY_BASE_NEXUS2_URL = 'user:name@nexus2.local';

    process.env.SNYK_BROKER_CLIENT_CONFIGURATION__common__default__BROKER_SERVER_URL = `http://localhost:${bs.port}`;
    process.env.SNYK_FILTER_RULES_PATHS__artifactory = clientAccept;
    bc = await createUniversalBrokerClient();
    await waitForUniversalBrokerClientsConnection(bs, 3);

    nock('https://artifactory.local')
      .persist()
      .get('/artifactory/api/system/ping')
      .reply(() => {
        return [500, 'artifactory - failed healthcheck'];
      });
    nock('https://nexus.local')
      .persist()
      .get('/service/rest/v1/status/check/api/system/ping')
      .reply(() => {
        return [500, 'nexus - failed healthcheck'];
      });
    nock('https://nexus2.local')
      .persist()
      .get('/nexus/service/local/status')
      .reply(() => {
        return [500, 'nexus2 - failed healthcheck'];
      });

    const response = await axiosClient.get(
      `http://localhost:${bc.port}/systemcheck`,
      { timeout: 10_000 },
    );

    expect(response.data).toBeInstanceOf(Array);
    const systemCheckBody = response.data;
    expect(response.status).toEqual(500);
    expect(systemCheckBody).toMatchObject([
      {
        connectionName: 'my artifactory credentials-in-url connection',
        message:
          'Validation failed, please review connection details for my artifactory credentials-in-url connection.',
        results: [
          {
            data: 'artifactory - failed healthcheck',
            statusCode: 500,
            url: 'https://${ARTIFACTORY_URL}/api/system/ping',
          },
        ],
        validated: false,
      },
      {
        connectionName: 'my nexus credentials-in-url connection',
        message:
          'Validation failed, please review connection details for my nexus credentials-in-url connection.',
        results: [
          {
            data: 'nexus - failed healthcheck',
            statusCode: 500,
            url: 'https://${BASE_NEXUS_URL}/service/rest/v1/status/check/api/system/ping',
          },
        ],
        validated: false,
      },
      {
        connectionName: 'my nexus2 credentials-in-url connection',
        message:
          'Validation failed, please review connection details for my nexus2 credentials-in-url connection.',
        results: [
          {
            data: 'nexus2 - failed healthcheck',
            statusCode: 500,
            url: 'https://${BASE_NEXUS2_URL}/nexus/service/local/status',
          },
        ],
        validated: false,
      },
    ]);

    delete process.env.CLIENT_ID;
    delete process.env.CLIENT_SECRET;
  });
});
