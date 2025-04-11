import path from 'path';
import version from '../../lib/hybrid-sdk/common/utils/version';
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

describe('proxy requests originating from behind the broker client', () => {
  let tws: TestWebServer;
  let bs: BrokerServer;
  let bc: BrokerClient;

  beforeAll(async () => {
    tws = await createTestWebServer();
    bs = await createBrokerServer({ filters: serverAccept });
  });

  afterAll(async () => {
    await tws.server.close();
    await closeBrokerServer(bs);
    delete process.env.BROKER_SERVER_URL;
  });

  afterEach(async () => {
    await closeBrokerClient(bc);
  });

  it('server healthcheck', async () => {
    bc = await createBrokerClient({
      brokerServerUrl: `http://localhost:${bs.port}`,
      brokerToken: '12345',
      filters: clientAccept,
    });
    await waitForBrokerClientConnection(bs);

    const response = await axiosClient.get(
      `http://localhost:${bs.port}/healthcheck`,
    );

    expect(response.status).toEqual(200);
    expect(response.data).toStrictEqual({ ok: true, version: version });
  });

  it('client healthcheck', async () => {
    bc = await createBrokerClient({
      brokerServerUrl: `http://localhost:${bs.port}`,
      brokerToken: '12345',
      filters: clientAccept,
    });
    await waitForBrokerClientConnection(bs);

    const response = await axiosClient.get(
      `http://localhost:${bc.port}/healthcheck`,
    );

    expect(response.status).toEqual(200);
    expect(response.data).toMatchObject([
      {
        brokerServerUrl: `http://localhost:${bs.port}/?connection_role=primary`,
        ok: true,
        websocketConnectionOpen: true,
        version: version,
      },
      {
        brokerServerUrl: `http://localhost:${bs.port}/?connection_role=secondary`,
        ok: true,
        websocketConnectionOpen: true,
        version: version,
      },
    ]);
  });

  it('check connection-status with connected client', async () => {
    bc = await createBrokerClient({
      brokerServerUrl: `http://localhost:${bs.port}`,
      brokerToken: '12345',
      filters: clientAccept,
    });
    await waitForBrokerClientConnection(bs);

    const response = await axiosClient.get(
      `http://localhost:${bs.port}/connection-status/12345`,
    );
    const expectedFilters = require(clientAccept);

    expect(response.status).toEqual(200);
    expect(response.data).toStrictEqual({
      ok: true,
      clients: expect.any(Array),
    });

    const connectionStatusBody = response.data.clients[0];
    expect(connectionStatusBody).toStrictEqual({
      version: version,
      filters: expectedFilters,
    });
  });

  it('check connection-status with context enabled connected client', async () => {
    bc = await createBrokerClient({
      brokerServerUrl: `http://localhost:${bs.port}`,
      brokerToken: '00000000-0000-0000-0000-00000000002',
      filters: clientAccept,
    });
    await waitForBrokerClientConnection(bs);

    const response = await axiosClient.get(
      `http://localhost:${bs.port}/connection-status/00000000-0000-0000-0000-00000000002/ctx/00000000-0000-0000-0000-00000000003`,
    );
    const expectedFilters = require(clientAccept);

    expect(response.status).toEqual(200);
    expect(response.data).toStrictEqual({
      ok: true,
      clients: expect.any(Array),
    });

    const connectionStatusBody = response.data.clients[0];
    expect(connectionStatusBody).toStrictEqual({
      version: version,
      filters: expectedFilters,
    });
  });

  it('check connection-status after client disconnected', async () => {
    bc = await createBrokerClient({
      brokerServerUrl: `http://localhost:${bs.port}`,
      brokerToken: '12345',
      filters: clientAccept,
    });
    await waitForBrokerClientConnections(bs, 2);
    await closeBrokerClient(bc);

    const response = await axiosClient.get(
      `http://localhost:${bs.port}/connection-status/12345`,
    );
    expect(response.status).toEqual(404);
  });

  it('misconfigured client fails healthcheck', async () => {
    bc = await createBrokerClient({
      brokerServerUrl: 'http://no-such-server',
      brokerToken: '12345',
      filters: clientAccept,
    });

    const response = await axiosClient.get(
      `http://localhost:${bc.port}/healthcheck`,
    );

    expect(response.status).toEqual(500);
    expect(response.data).toStrictEqual([
      {
        brokerServerUrl: 'http://no-such-server/?connection_role=primary',
        ok: false,
        transport: expect.any(String),
        version: version,
        websocketConnectionOpen: false,
      },
      {
        brokerServerUrl: 'http://no-such-server/?connection_role=secondary',
        ok: false,
        transport: expect.any(String),
        version: version,
        websocketConnectionOpen: false,
      },
    ]);
  });

  it('custom healthcheck endpoint', async () => {
    bc = await createBrokerClient({
      brokerServerUrl: `http://localhost:${bs.port}`,
      brokerToken: '12345',
      filters: clientAccept,
      brokerHealthcheckPath: '/custom/healthcheck/endpoint',
    });
    await waitForBrokerClientConnection(bs);

    const response = await axiosClient.get(
      `http://localhost:${bc.port}/custom/healthcheck/endpoint`,
    );

    expect(response.status).toEqual(200);
    expect(response.data).toMatchObject([
      {
        ok: true,
        version: version,
      },
      {
        ok: true,
        version: version,
      },
    ]);
  });
});
