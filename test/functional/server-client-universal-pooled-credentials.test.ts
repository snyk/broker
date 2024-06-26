import path from 'path';
import version from '../../lib/common/utils/version';
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

const fixtures = path.resolve(__dirname, '..', 'fixtures');
const serverAccept = path.join(fixtures, 'server', 'filters.json');
const clientAccept = path.join(fixtures, 'client', 'filters.json');

describe('proxy requests originating from behind the broker server with pooled credentials', () => {
  let tws: TestWebServer;
  let bs: BrokerServer;
  let bc: BrokerClient;
  let brokerTokens: string[];
  let metadataArray: unknown[];

  beforeAll(async () => {
    process.env.SKIP_REMOTE_CONFIG = 'true';
    delete process.env.BROKER_SERVER_URL;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN_POOL;
    delete process.env.SNYK_BROKER_SERVER_UNIVERSAL_CONFIG_ENABLED;
    delete process.env
      .SNYK_BROKER_CLIENT_CONFIGURATION__common__default__BROKER_SERVER_URL;

    const PORT = 9999;
    tws = await createTestWebServer();

    bs = await createBrokerServer({ port: PORT, filters: serverAccept });

    process.env.SNYK_BROKER_SERVER_UNIVERSAL_CONFIG_ENABLED = 'true';
    process.env.UNIVERSAL_BROKER_ENABLED = 'true';
    process.env.SERVICE_ENV = 'universaltestpool';
    process.env.BROKER_TOKEN_1 = 'brokertoken1';
    process.env.BROKER_TOKEN_2 = 'brokertoken2';
    process.env.BROKER_TOKEN_3 = 'brokertoken3';
    process.env.BROKER_TOKEN_4 = 'brokertoken4';
    process.env.JIRA_PAT = 'jirapat';
    process.env.JIRA_HOSTNAME = 'hostname';
    process.env.GITHUB_TOKEN_POOL = 'ghtoken1,ghtoken2';
    process.env.GITLAB_TOKEN = 'gltoken';
    process.env.AZURE_REPOS_TOKEN = '123';
    process.env.AZURE_REPOS_HOST = 'hostname';
    process.env.AZURE_REPOS_ORG = 'org';
    process.env.SNYK_BROKER_CLIENT_CONFIGURATION__common__default__BROKER_SERVER_URL = `http://localhost:${bs.port}`;
    process.env.SNYK_FILTER_RULES_PATHS__github = clientAccept;
    process.env.SNYK_FILTER_RULES_PATHS__gitlab = clientAccept;
    process.env['SNYK_FILTER_RULES_PATHS__azure-repos'] = clientAccept;
    process.env['SNYK_FILTER_RULES_PATHS__jira-bearer-auth'] = clientAccept;
    bc = await createUniversalBrokerClient();
    ({ brokerTokens, metadataArray } =
      await waitForUniversalBrokerClientsConnection(bs, 2));
  });

  afterAll(async () => {
    await tws.server.close();
    await closeBrokerClient(bc);
    await closeBrokerServer(bs);
    delete process.env.BROKER_SERVER_URL;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN_POOL;
    delete process.env.SNYK_BROKER_SERVER_UNIVERSAL_CONFIG_ENABLED;
    delete process.env
      .SNYK_BROKER_CLIENT_CONFIGURATION__common__default__BROKER_SERVER_URL;
  });

  it('identification', async () => {
    expect(brokerTokens).toEqual(
      expect.arrayContaining(['brokertoken1', 'brokertoken2']),
    );
    expect(metadataArray).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capabilities: ['post-streams'],
          clientId: expect.any(String),
          version,
        }),
      ]),
    );
  });

  it('successfully broker on endpoint that forwards requests with basic auth, using first credential', async () => {
    const url = `http://localhost:${bs.port}/broker/${brokerTokens[0]}/basic-auth`;

    const response = await axiosClient.get(url, { timeout: 5000 });
    const status = response.status;
    expect(status).toEqual(200);

    const auth = response.data.replace('Basic ', '');
    const encodedAuth = Buffer.from(auth, 'base64').toString('utf-8');

    expect(encodedAuth).toEqual('user:pass');
  });

  it('successfully broker on endpoint that forwards requests with token auth in origin, using first credential', async () => {
    const url = `http://localhost:${bs.port}/broker/${brokerTokens[0]}/echo-headers/github-token-in-origin`;

    const response = await axiosClient.post(url, {});
    expect(response.status).toEqual(200);
    expect(response.data.authorization).toEqual('token githubToken1');
  });

  it('successfully broker on endpoint that forwards requests with token auth in origin, using first credential again', async () => {
    const url = `http://localhost:${bs.port}/broker/${brokerTokens[0]}/echo-headers/github`;

    const response = await axiosClient.post(url, {});
    expect(response.status).toEqual(200);
    expect(response.data.authorization).toEqual('token githubToken');
  });

  it('successfully broker on endpoint that forwards requests with token auth in origin, using token pool', async () => {
    const url = `http://localhost:${bs.port}/broker/${brokerTokens[0]}/echo-headers/github-pool`;

    const response = await axiosClient.post(url, {});
    expect(response.status).toEqual(200);
    expect(response.data.authorization).toEqual('token ghtoken1');

    const response2 = await axiosClient.post(url, {});
    expect(response2.status).toEqual(200);
    expect(response2.data.authorization).toEqual('token ghtoken2');
  });
});
