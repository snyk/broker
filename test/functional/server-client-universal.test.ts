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

const fixtures = path.resolve(__dirname, '..', 'fixtures');
const serverAccept = path.join(fixtures, 'server', 'filters.json');
const clientAccept = path.join(fixtures, 'client', 'filters.json');

describe('proxy requests originating from behind the broker server', () => {
  let tws: TestWebServer;
  let bs: BrokerServer;
  let bc: BrokerClient;

  const spyLogWarn = jest
    .spyOn(require('bunyan').prototype, 'warn')
    .mockImplementation((value) => {
      return value;
    });

  beforeAll(async () => {
    const PORT = 9999;
    tws = await createTestWebServer();
    process.env.RESPONSE_DATA_HIDDEN_ENABLED = 'true';
    bs = await createBrokerServer({ filters: serverAccept, port: PORT });

    process.env.SNYK_BROKER_SERVER_UNIVERSAL_CONFIG_ENABLED = 'true';
    process.env.API_BASE_URL = `http://localhost:${bs.port}`;
    process.env.UNIVERSAL_BROKER_ENABLED = 'true';
    process.env.SERVICE_ENV = 'universaltest';
    process.env.BROKER_TOKEN_1 = 'brokertoken1';
    process.env.BROKER_TOKEN_2 = 'brokertoken2';
    process.env.BROKER_TOKEN_3 = 'brokertoken3';
    process.env.BROKER_TOKEN_4 = 'brokertoken4';
    process.env.GITHUB_TOKEN = 'ghtoken';
    process.env.GITLAB_TOKEN = 'gltoken';
    process.env.AZURE_REPOS_TOKEN = '123';
    process.env.AZURE_REPOS_HOST = 'hostname';
    process.env.AZURE_REPOS_ORG = 'org';
    process.env.JIRA_PAT = 'jirapat';
    process.env.RAW_AUTH = 'CustomScheme CustomToken';
    process.env.JIRA_HOSTNAME = 'hostname';
    process.env.SNYK_BROKER_CLIENT_CONFIGURATION__common__default__BROKER_SERVER_URL = `http://localhost:${bs.port}`;
    process.env.SNYK_FILTER_RULES_PATHS__github = clientAccept;
    process.env.SNYK_FILTER_RULES_PATHS__gitlab = clientAccept;
    process.env['SNYK_FILTER_RULES_PATHS__azure-repos'] = clientAccept;
    process.env['SNYK_FILTER_RULES_PATHS__jira-bearer-auth'] = clientAccept;
    process.env.CLIENT_ID = 'clienid';
    process.env.CLIENT_SECRET = 'clientsecret';
    process.env.SKIP_REMOTE_CONFIG = 'true';

    bc = await createUniversalBrokerClient();
    await waitForUniversalBrokerClientsConnection(bs, 2);
  });

  afterEach(async () => {
    spyLogWarn.mockReset();
  });
  afterAll(async () => {
    spyLogWarn.mockReset();
    await tws.server.close();
    await closeBrokerClient(bc);
    await closeBrokerServer(bs);
    delete process.env.BROKER_SERVER_URL;
    delete process.env.SNYK_BROKER_SERVER_UNIVERSAL_CONFIG_ENABLED;
    delete process.env
      .SNYK_BROKER_CLIENT_CONFIGURATION__common__default__BROKER_SERVER_URL;
    delete process.env.CLIENT_ID;
    delete process.env.CLIENT_SECRET;
    delete process.env.SKIP_REMOTE_CONFIG;
  });

  it('successfully broker GET', async () => {
    const response = await axiosClient.get(
      `http://localhost:${bs.port}/broker/${process.env.BROKER_TOKEN_1}/echo-param/xyz`,
    );
    const response2 = await axiosClient.get(
      `http://localhost:${bs.port}/broker/${process.env.BROKER_TOKEN_2}/echo-param/xyz`,
    );

    const response3 = await axiosClient.get(
      `http://localhost:${bs.port}/broker/${process.env.BROKER_TOKEN_3}/echo-auth-header-with-basic-auth/xyz`,
    );

    const response4 = await axiosClient.get(
      `http://localhost:${bs.port}/broker/${process.env.BROKER_TOKEN_4}/echo-auth-header-with-bearer-auth/xyz`,
    );

    const response5 = await axiosClient.get(
      `http://localhost:${bs.port}/broker/${process.env.BROKER_TOKEN_4}/echo-auth-header-with-bearer-auth/xyz`,
      { headers: { 'x-broker-ws-response': 'whatever' } },
    );

    const response6 = await axiosClient.get(
      `http://localhost:${bs.port}/broker/${process.env.BROKER_TOKEN_4}/echo-auth-header-with-raw-auth/xyz`,
    );

    // const response6 = await axiosClient.get(
    //   `http://localhost:${bs.port}/broker/${process.env.BROKER_TOKEN_3}/echo-auth-header-with-token-auth/xyz`,
    // );

    expect(response.status).toEqual(200);
    expect(response.data).toEqual('xyz');
    expect(response2.status).toEqual(200);
    expect(response2.data).toEqual('xyz');
    expect(response3.status).toEqual(200);
    expect(response3.data).toEqual(
      `Basic ${Buffer.from('PAT:' + process.env.AZURE_REPOS_TOKEN).toString(
        'base64',
      )}`,
    );
    expect(response4.status).toEqual(200);
    expect(response4.data).toEqual(`Bearer ${process.env.JIRA_PAT}`);

    expect(response5.status).toEqual(200);
    expect(response5.data).toEqual(`Bearer ${process.env.JIRA_PAT}`);

    expect(response6.status).toEqual(200);
    expect(response6.data).toEqual(`${process.env.RAW_AUTH}`);

    expect(response.headers['x-broker-ws-response']).not.toBeNull();
  });

  it('successfully warn logs requests without x-snyk-broker-type header', async () => {
    const response = await axiosClient.get(
      `http://localhost:${bs.port}/broker/${process.env.BROKER_TOKEN_1}/echo-param/xyz`,
    );
    const response2 = await axiosClient.get(
      `http://localhost:${bs.port}/broker/${process.env.BROKER_TOKEN_2}/echo-param/xyz`,
    );
    expect(response.status).toEqual(200);
    expect(response.data).toEqual('xyz');

    expect(response2.status).toEqual(200);
    expect(response2.data).toEqual('xyz');

    expect(spyLogWarn).toHaveBeenCalledTimes(2);
    expect(spyLogWarn).toHaveBeenCalledWith(
      expect.any(Object),
      'Error: Request does not contain the x-snyk-broker-type header',
    );
  });
});
