import http from 'http';
import path from 'path';
import { setTimeout as sleep } from 'timers/promises';
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
import { TestWebServer, createTestWebServer } from '../setup/test-web-server';

const fixtures = path.resolve(__dirname, '..', 'fixtures');
const serverAccept = path.join(fixtures, 'server', 'filters.json');
const clientAccept = path.join(fixtures, 'client', 'filters.json');

// Longer than Node's default keepAliveTimeout (5s) plus its 1s keepAliveTimeoutBuffer.
const IDLE_GAP_MS = 7000;

const get = (
  agent: http.Agent,
  url: string,
): Promise<{ status?: number; body: string; reusedSocket: boolean }> =>
  new Promise((resolve, reject) => {
    const req = http.get(url, { agent }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () =>
        resolve({
          status: res.statusCode,
          body,
          reusedSocket: req.reusedSocket,
        }),
      );
    });
    req.on('error', reject);
  });

describe('broker server keeps idle upstream connections open', () => {
  let tws: TestWebServer;
  let bs: BrokerServer;
  let bc: BrokerClient;
  let brokerToken: string;
  const originalBrokerType = process.env.BROKER_TYPE;

  beforeAll(async () => {
    const PORT = 9999;
    process.env.BROKER_SERVER_URL = `http://localhost:${PORT}`;
    // The broker server is not deployed with BROKER_TYPE=server.
    delete process.env.BROKER_TYPE;

    tws = await createTestWebServer();
    bs = await createBrokerServer({ port: PORT, filters: serverAccept });
    bc = await createBrokerClient({
      brokerServerUrl: `${process.env.BROKER_SERVER_URL}`,
      brokerToken: 'broker-token-12345',
      filters: clientAccept,
      type: 'client',
    });
    const connData = await waitForBrokerClientConnections(bs, 2);
    brokerToken = connData.brokerTokens[0];
  });

  afterAll(async () => {
    await tws.server.close();
    await closeBrokerClient(bc);
    await closeBrokerServer(bs);
    delete process.env.BROKER_SERVER_URL;
    if (originalBrokerType !== undefined) {
      process.env.BROKER_TYPE = originalBrokerType;
    }
  });

  it(
    'reuses a pooled connection after it has been idle for longer than the Node default keep-alive',
    async () => {
      // Behaves like the gateway proxy: one pooled upstream connection, reused when idle.
      const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
      const url = `http://localhost:${bs.port}/broker/${brokerToken}/echo-param/xyz`;
      try {
        const first = await get(agent, url);
        expect(first.status).toEqual(200);
        expect(first.body).toEqual('xyz');
        expect(first.reusedSocket).toBe(false);

        await sleep(IDLE_GAP_MS);

        const second = await get(agent, url);
        expect(second.status).toEqual(200);
        expect(second.body).toEqual('xyz');
        expect(second.reusedSocket).toBe(true);
      } finally {
        agent.destroy();
      }
    },
    IDLE_GAP_MS + 10000,
  );
});
