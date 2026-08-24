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
  waitForBrokerClientConnections,
} from '../setup/broker-server';

const fixtures = path.resolve(__dirname, '..', 'fixtures');
const serverAccept = path.join(fixtures, 'server', 'filters.json');
const clientAccept = path.join(fixtures, 'client', 'filters.json');

describe('broker client reconnect window', () => {
  let bs: BrokerServer;
  let bc: BrokerClient;

  beforeAll(async () => {
    bs = await createBrokerServer({ filters: serverAccept });
  });

  afterAll(async () => {
    await closeBrokerClient(bc);
    await closeBrokerServer(bs);
  });

  it('returns a retryable response immediately after a client disconnected', async () => {
    const brokerToken = 'recently-disconnected-token';
    bc = await createBrokerClient({
      brokerServerUrl: `http://localhost:${bs.port}`,
      brokerToken,
      filters: clientAccept,
    });
    await waitForBrokerClientConnections(bs, 2);
    await closeBrokerClient(bc);

    const response = await axiosClient.post(
      `http://localhost:${bs.port}/broker/${brokerToken}/echo-body`,
      {},
    );

    expect(response.status).toEqual(503);
    expect(response.data).toStrictEqual({ ok: false });
    expect(response.headers['x-broker-failure']).toEqual(
      'connection-not-ready',
    );
    expect(response.headers['retry-after']).toEqual('1');
  });
});
