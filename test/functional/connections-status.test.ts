import path from 'path';
import { axiosClient } from '../setup/axios-client';
import {
  BrokerClient,
  closeBrokerClient,
  createBrokerClient,
} from '../setup/broker-client';
import {
  BrokerServer,
  closeBrokerServer,
  createBrokerServer,
  waitForBrokerClientConnection,
  waitForBrokerClientConnections,
} from '../setup/broker-server';
import { TestWebServer, createTestWebServer } from '../setup/test-web-server';

const fixtures = path.resolve(__dirname, '..', 'fixtures');
const serverAccept = path.join(fixtures, 'server', 'filters.json');
const clientAccept = path.join(fixtures, 'client', 'filters.json');

describe('connections status on server side', () => {
  let tws: TestWebServer;
  let bs: BrokerServer;
  let bc: BrokerClient;
  let bc2: BrokerClient;
  let bc3: BrokerClient;
  let bc4: BrokerClient;

  beforeAll(async () => {
    tws = await createTestWebServer();
  });
  beforeEach(async () => {
    bs = await createBrokerServer({ filters: serverAccept });
  });

  afterAll(async () => {
    if (bc) {
      await closeBrokerClient(bc);
    }
    if (bc2) {
      await closeBrokerClient(bc2);
    }
    if (bc3) {
      await closeBrokerClient(bc3);
    }
    if (bc4) {
      await closeBrokerClient(bc4);
    }
    await tws.server.close();
    await closeBrokerServer(bs);
    delete process.env.BROKER_SERVER_URL;
  });

  afterEach(async () => {
    if (bc) {
      await closeBrokerClient(bc);
    }
    if (bc2) {
      await closeBrokerClient(bc2);
    }
    if (bc3) {
      await closeBrokerClient(bc3);
    }
    if (bc4) {
      await closeBrokerClient(bc4);
    }
    await closeBrokerServer(bs);
  });

  it('check connection-status with connected clients', async () => {
    bc4 = await createBrokerClient({
      brokerServerUrl: `http://localhost:${bs.port}`,
      brokerToken: '00000000-0000-0000-0000-00000000000',
      filters: clientAccept,
    });
    await waitForBrokerClientConnection(bs);

    bc2 = await createBrokerClient({
      brokerServerUrl: `http://localhost:${bs.port}`,
      brokerToken: '00000000-0000-0000-0000-00000000000',
      filters: clientAccept,
    });

    bc3 = await createBrokerClient({
      brokerServerUrl: `http://localhost:${bs.port}`,
      brokerToken: '00000000-0000-0000-0000-00000000001',
      filters: clientAccept,
    });
    await waitForBrokerClientConnection(bs);

    const response = await axiosClient.get(
      `http://localhost:${bs.port}/connections-status`,
    );

    expect(response.status).toEqual(200);
    expect(response.data).toStrictEqual([
      {
        brokerClientIds: [expect.any(String), expect.any(String)],
        hashedIdentifier:
          'dfe8068d0b285225c921695e70604f1fd12fd139df331f68a167bbd49f9a2213',
        identifier: '0000-...-0000',
        versions: ['local'],
      },
      {
        brokerClientIds: [expect.any(String)],
        hashedIdentifier:
          '75ce1f9945985a713d84fd58c2bfc461566e18422dac79bdb4a367a4f247a6f3',
        identifier: '0000-...-0001',
        versions: ['local'],
      },
    ]);
  });

  it('check connections-status empty', async () => {
    bc = await createBrokerClient({
      brokerServerUrl: `http://localhost:${bs.port}`,
      brokerToken: '00000000-0000-0000-0000-00000000002',
      filters: clientAccept,
    });
    await waitForBrokerClientConnections(bs, 1);
    await closeBrokerClient(bc);

    const response = await axiosClient.get(
      `http://localhost:${bs.port}/connections-status`,
    );
    expect(response.status).toEqual(200);
    expect(response.data).toEqual([]);
  });
});
