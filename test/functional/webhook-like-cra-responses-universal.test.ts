const PORT = 9000;
import path from 'path';
import { axiosClient } from '../setup/axios-client';
import {
  BrokerClient,
  closeBrokerClient,
  waitForBrokerServerConnections,
} from '../setup/broker-client';
import {
  BrokerServer,
  closeBrokerServer,
  createBrokerServer,
  waitForUniversalBrokerClientsConnection,
} from '../setup/broker-server';
import { TestWebServer, createTestWebServer } from '../setup/test-web-server';
import { DEFAULT_TEST_WEB_SERVER_PORT } from '../setup/constants';
import { createUniversalBrokerClient } from '../setup/broker-universal-client';

const fixtures = path.resolve(__dirname, '..', 'fixtures');
const serverAccept = path.join(fixtures, 'server', 'filters-cra.json');
// const clientAccept = path.join(fixtures, 'client', 'filters-cra.json');

describe('proxy requests originating from behind the broker client', () => {
  let tws: TestWebServer;
  let bs: BrokerServer;
  let bc: BrokerClient;
  process.env.API_BASE_URL = `http://localhost:${DEFAULT_TEST_WEB_SERVER_PORT}`;

  beforeAll(async () => {
    tws = await createTestWebServer();

    bs = await createBrokerServer({ port: PORT, filters: serverAccept });

    process.env.SKIP_REMOTE_CONFIG = 'true';
    process.env.SNYK_BROKER_SERVER_UNIVERSAL_CONFIG_ENABLED = 'true';
    process.env.UNIVERSAL_BROKER_ENABLED = 'true';
    process.env.SERVICE_ENV = 'universaltest4';
    process.env.BROKER_TOKEN_1 = 'brokertoken1';
    process.env.SNYK_BROKER_CLIENT_CONFIGURATION__common__default__BROKER_SERVER_URL = `http://localhost:${bs.port}`;

    bc = await createUniversalBrokerClient();
    await waitForUniversalBrokerClientsConnection(bs, 1);
  });

  afterAll(async () => {
    await tws.server.close();
    await closeBrokerClient(bc);
    await closeBrokerServer(bs);
    delete process.env.BROKER_SERVER_URL;
  });

  it('successfully broker CRA results call', async () => {
    const serverMetadata = await waitForBrokerServerConnections(bc);
    expect(serverMetadata.map((x) => x.brokertoken)).toEqual(
      expect.arrayContaining(['brokertoken1']),
    );
    expect(serverMetadata.map((x) => x.capabilities)).toEqual(
      expect.arrayContaining([['receive-post-streams']]),
    );

    const response = await axiosClient.post(
      `http://localhost:${bc.port}/api/v2/import/done`,
      { some: { example: 'json' } },
    );

    expect(response.status).toEqual(200);
  });
});
