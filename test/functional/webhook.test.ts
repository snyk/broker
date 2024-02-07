const PORT = 9999;
process.env.BROKER_SERVER_URL = `http://localhost:${PORT}`;
import path from 'path';
import { axiosClient } from '../setup/axios-client';
import {
  BrokerClient,
  closeBrokerClient,
  createBrokerClient,
  waitForBrokerServerConnection,
} from '../setup/broker-client';
import {
  BrokerServer,
  closeBrokerServer,
  createBrokerServer,
  waitForBrokerClientConnection,
} from '../setup/broker-server';
import { TestWebServer, createTestWebServer } from '../setup/test-web-server';
import { DEFAULT_TEST_WEB_SERVER_PORT } from '../setup/constants';

const fixtures = path.resolve(__dirname, '..', 'fixtures');
const serverAccept = path.join(fixtures, 'server', 'filters-webhook.json');
const clientAccept = path.join(fixtures, 'client', 'filters-webhook.json');

describe('proxy requests originating from behind the broker client', () => {
  let tws: TestWebServer;
  let bs: BrokerServer;
  let bc: BrokerClient;
  let brokerToken: string;
  let serverMetadata: unknown;
  process.env.API_BASE_URL = `http://localhost:${DEFAULT_TEST_WEB_SERVER_PORT}`;

  beforeAll(async () => {
    tws = await createTestWebServer();

    bs = await createBrokerServer({ port: PORT, filters: serverAccept });

    bc = await createBrokerClient({
      brokerServerUrl: `http://localhost:${bs.port}`,
      brokerToken: 'broker-token-12345',
      filters: clientAccept,
      type: 'client',
    });
    ({ brokerToken } = await waitForBrokerClientConnection(bs));
  });

  afterAll(async () => {
    await tws.server.close();
    await closeBrokerClient(bc);
    await closeBrokerServer(bs);
    delete process.env.BROKER_SERVER_URL;
  });

  it('server identifies self to client', async () => {
    serverMetadata = await waitForBrokerServerConnection(bc);

    expect(brokerToken).toEqual('broker-token-12345');
    expect(serverMetadata).toMatchObject({
      capabilities: ['receive-post-streams'],
    });
  });

  it('successfully broker Webhook call via tunnel', async () => {
    const response = await axiosClient.post(
      `http://localhost:${bc.port}/webhook/github/12345678-1234-1234-1234-123456789abc`,
      { some: { example: 'json' } },
    );

    expect(response.status).toEqual(200);
    expect(response.data).toStrictEqual('Received webhook via websocket');
  });

  it('successfully broker Webhook call via API', async () => {
    await closeBrokerServer(bs);

    const response = await axiosClient.post(
      `http://localhost:${bc.port}/webhook/github/12345678-1234-1234-1234-000000000000`,
      { some: { example: 'json' } },
    );

    expect(response.status).toEqual(200);
    expect(response.data).toStrictEqual('Received webhook via API');
  });
});
