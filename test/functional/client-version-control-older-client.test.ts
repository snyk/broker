process.env.BROKER_VERSION = '4.90.0';
import path from 'path';
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
  // waitForBrokerClientConnection,
  waitForBrokerClientConnections,
} from '../setup/broker-server';

import { TestWebServer, createTestWebServer } from '../setup/test-web-server';

import { axiosClient } from '../setup/axios-client';
import { delay } from '../helpers/utils';

const fixtures = path.resolve(__dirname, '..', 'fixtures');
const serverAccept = path.join(fixtures, 'server', 'filters.json');
const clientAccept = path.join(fixtures, 'client', 'filters.json');

describe('older broker version control', () => {
  let tws: TestWebServer;
  let bs: BrokerServer;
  let bc: BrokerClient;
  let brokerToken: string;
  let serverMetadata: unknown;

  beforeAll(async () => {
    const PORT = 9999;
    process.env.BROKER_SERVER_URL = `http://localhost:${PORT}`;

    tws = await createTestWebServer();

    bs = await createBrokerServer({ port: PORT, filters: serverAccept });

    bc = await createBrokerClient({
      brokerServerUrl: `http://localhost:${bs.port}`,
      brokerToken: 'broker-token-12345',
      filters: clientAccept,
      type: 'client',
    });
    const connData = await waitForBrokerClientConnections(bs, 2);
    const primaryIndex = connData.metadataArray[0]['role'] == 'primary' ? 0 : 1;
    brokerToken = connData.brokerTokens[primaryIndex];
    serverMetadata = connData.metadataArray[primaryIndex];
  });

  afterAll(async () => {
    await tws.server.close();
    await closeBrokerClient(bc);
    await closeBrokerServer(bs);
    delete process.env.BROKER_SERVER_URL;
  });

  it('server closes connection if version is older than cutoff', async () => {
    serverMetadata = await waitForBrokerServerConnection(bc);

    expect(brokerToken).toEqual('broker-token-12345');
    expect(serverMetadata).toMatchObject({
      capabilities: ['receive-post-streams'],
    });
    await delay(100);
    // expect(isWebsocketConnOpen(bs.server[0])).toBeFalsy()
    const response = await axiosClient.get(
      `http://localhost:${bc.port}/healthcheck`,
      // { some: { example: 'json' } },
    );
    expect(response.status).toEqual(500);
    expect(response.data).toStrictEqual([
      {
        ok: false,
        websocketConnectionOpen: false,
        brokerServerUrl: 'http://localhost:9999/?connection_role=primary',
        version: '4.90.0',
        transport: expect.any(String),
      },
      {
        ok: false,
        websocketConnectionOpen: false,
        brokerServerUrl: 'http://localhost:9999/?connection_role=secondary',
        version: '4.90.0',
        transport: expect.any(String),
      },
    ]);
  });
});
