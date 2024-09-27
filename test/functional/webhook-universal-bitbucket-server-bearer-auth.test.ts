const PORT = 9999;
process.env.BROKER_SERVER_URL = `http://localhost:${PORT}`;
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
const serverAccept = path.join(fixtures, 'server', 'filters-webhook.json');
const clientAccept = path.join(fixtures, 'client', 'filters-webhook.json');

describe('proxy requests originating from behind the broker client', () => {
  let tws: TestWebServer;
  let bs: BrokerServer;
  let bc: BrokerClient;
  process.env.API_BASE_URL = `http://localhost:${DEFAULT_TEST_WEB_SERVER_PORT}`;

  beforeAll(async () => {
    process.env.SKIP_REMOTE_CONFIG = 'true';
    tws = await createTestWebServer();

    bs = await createBrokerServer({ port: PORT, filters: serverAccept });

    process.env.SNYK_BROKER_SERVER_UNIVERSAL_CONFIG_ENABLED = 'true';
    process.env.UNIVERSAL_BROKER_ENABLED = 'true';
    process.env.SERVICE_ENV = 'universaltest7';
    process.env.BROKER_TOKEN_1 = 'brokertoken1';
    // process.env.BROKER_TOKEN_2 = 'brokertoken2';
    process.env.SNYK_BROKER_CLIENT_CONFIGURATION__common__default__BROKER_SERVER_URL = `http://localhost:${bs.port}`;
    process.env['SNYK_FILTER_RULES_PATHS__bitbucket-server-bearer-auth'] =
      clientAccept;
    // process.env['SNYK_FILTER_RULES_PATHS__github-cloud-app'] = clientAccept;

    bc = await createUniversalBrokerClient();
    await waitForUniversalBrokerClientsConnection(bs, 1);
  });

  afterAll(async () => {
    await tws.server.close();
    await closeBrokerClient(bc);
    await closeBrokerServer(bs);
    delete process.env.BROKER_SERVER_URL;
  });

  it('server identifies self to client', async () => {
    const serverMetadata = await waitForBrokerServerConnections(bc);
    expect(serverMetadata.map((x) => x.brokertoken)).toEqual(
      expect.arrayContaining(['brokertoken1']),
    );
    expect(serverMetadata.map((x) => x.capabilities)).toEqual(
      expect.arrayContaining([['receive-post-streams']]),
    );
  });

  it('successfully broker Bitbucket servers Webhook call via bitbucket-server-bearer-auth tunnel conn', async () => {
    const response = await axiosClient.post(
      `http://localhost:${bc.port}/webhook/bitbucket-server/12345678-1234-1234-1234-123456789abc`,
      { some: { example: 'json' } },
    );

    expect(response.status).toEqual(200);
    expect(response.data).toStrictEqual('Received webhook via websocket');
  });

  it('successfully fails Webhook call without matching type', async () => {
    const response = await axiosClient.post(
      `http://localhost:${bc.port}/webhook/githubd/12345678-1234-1234-1234-000000000000`,
      { some: { example: 'json' } },
    );

    expect(response.status).toEqual(401);
    expect(response.data).toStrictEqual(
      'Unexpected type in webhook request, unable to forward to server.',
    );
  });

  it('successfully fails Webhook call via API without matching type', async () => {
    await closeBrokerServer(bs);

    const response = await axiosClient.post(
      `http://localhost:${bc.port}/webhook/githubd/12345678-1234-1234-1234-000000000000`,
      { some: { example: 'json' } },
    );

    expect(response.status).toEqual(401);
    expect(response.data).toStrictEqual(
      'Unexpected type in webhook request, unable to forward to server.',
    );
  });
});
