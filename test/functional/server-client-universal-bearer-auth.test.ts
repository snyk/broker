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
    process.env.API_BASE_URL = `http://localhost:${bs.port}`;
    process.env.SNYK_BROKER_SERVER_UNIVERSAL_CONFIG_ENABLED = 'true';
    process.env.UNIVERSAL_BROKER_ENABLED = 'true';
    process.env.SERVICE_ENV = 'universaltest7';
    process.env.BROKER_TOKEN_1 = 'brokertoken1';
    process.env.SNYK_BROKER_CLIENT_CONFIGURATION__common__default__BROKER_SERVER_URL = `http://localhost:${bs.port}`;
    process.env['SNYK_FILTER_RULES_PATHS__bitbucket-server-bearer-auth'] =
      clientAccept;
    process.env.CLIENT_ID = 'clienid';
    process.env.CLIENT_SECRET = 'clientsecret';
    process.env.SKIP_REMOTE_CONFIG = 'true';
    process.env.BEARER_PAT = 'mypat';

    bc = await createUniversalBrokerClient();
    await waitForUniversalBrokerClientsConnection(bs, 1);
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
      `http://localhost:${bs.port}/broker/${process.env.BROKER_TOKEN_1}/echo-auth-header-with-bb-bearer-auth/xyz`,
    );

    expect(response.status).toEqual(200);
    expect(response.data).toEqual(`Bearer ${process.env.BEARER_PAT}`);

    expect(response.headers['x-broker-ws-response']).not.toBeNull();
  });
});
