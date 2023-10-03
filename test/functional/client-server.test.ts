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

const fixtures = path.resolve(__dirname, '..', 'fixtures');
const serverAccept = path.join(fixtures, 'server', 'filters.json');
const clientAccept = path.join(fixtures, 'client', 'filters.json');

describe('proxy requests originating from behind the broker client', () => {
  let tws: TestWebServer;
  let bs: BrokerServer;
  let bc: BrokerClient;
  let brokerToken: string;
  let serverMetadata: unknown;

  beforeAll(async () => {
    tws = await createTestWebServer();

    bs = await createBrokerServer({ filters: serverAccept });

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

  it('successfully broker POST', async () => {
    const response = await axiosClient.post(
      `http://localhost:${bc.port}/echo-body`,
      { some: { example: 'json' } },
    );

    expect(response.status).toEqual(200);
    expect(response.data).toStrictEqual({
      some: { example: 'json' },
    });
  });

  it('successfully broker exact bytes of POST body', async () => {
    // stringify the JSON unusually to ensure an unusual exact body
    const body = Buffer.from(
      JSON.stringify({ some: { example: 'json' } }, null, 5),
    );
    const response = await axiosClient.post(
      `http://localhost:${bc.port}/echo-body`,
      body,
      {
        headers: { 'content-type': 'application/json' },
        transformResponse: (r) => r,
      },
    );

    expect(response.status).toEqual(200);
    expect(Buffer.from(response.data)).toEqual(body);
  });

  it('successfully broker GET', async () => {
    const response = await axiosClient.get(
      `http://localhost:${bc.port}/echo-param/xyz`,
    );

    expect(response.status).toEqual(200);
    expect(response.data).toEqual('xyz');
  });

  it('block request for non-whitelisted url', async () => {
    const response = await axiosClient.post(
      `http://localhost:${bc.port}/not-allowed`,
      {},
    );

    expect(response.status).toEqual(401);
    expect(response.data).toStrictEqual({
      message: 'blocked',
      reason: 'Request does not match any accept rule, blocking HTTP request',
      url: '/not-allowed',
    });
  });

  it('allow request for valid url with valid body', async () => {
    const response = await axiosClient.post(
      `http://localhost:${bc.port}/echo-body/filtered`,
      { proxy: { me: 'please' } },
    );

    expect(response.status).toEqual(200);
    expect(response.data).toStrictEqual({
      proxy: { me: 'please' },
    });
  });

  it('block request for valid url with invalid body', async () => {
    const response = await axiosClient.post(
      `http://localhost:${bc.port}/echo-body/filtered`,
      { proxy: { me: 'now!' } },
    );

    expect(response.status).toEqual(401);
    expect(response.data).toStrictEqual({
      message: 'blocked',
      reason: 'Request does not match any accept rule, blocking HTTP request',
      url: '/echo-body/filtered',
    });
  });

  it('allow request for valid url with valid query param', async () => {
    const response = await axiosClient.get(
      `http://localhost:${bc.port}/echo-query/filtered`,
      {
        params: { proxyMe: 'please' },
      },
    );

    expect(response.status).toEqual(200);
    expect(response.data).toStrictEqual({
      proxyMe: 'please',
    });
  });

  it('block request for valid url with invalid query param', async () => {
    const response = await axiosClient.get(
      `http://localhost:${bc.port}/echo-query/filtered`,
      {
        params: { proxyMe: 'now!' },
      },
    );

    expect(response.status).toEqual(401);
    expect(response.data).toStrictEqual({
      message: 'blocked',
      reason: 'Request does not match any accept rule, blocking HTTP request',
      url: '/echo-query/filtered?proxyMe=now!',
    });
  });

  it('block request for valid url with missing query param', async () => {
    const response = await axiosClient.get(
      `http://localhost:${bc.port}/echo-query/filtered`,
    );

    expect(response.status).toEqual(401);
    expect(response.data).toStrictEqual({
      message: 'blocked',
      reason: 'Request does not match any accept rule, blocking HTTP request',
      url: '/echo-query/filtered',
    });
  });

  it('block request for valid URL which is not allowed on server', async () => {
    const response = await axiosClient.get(
      `http://localhost:${bc.port}/server-side-blocked`,
    );

    expect(response.status).toEqual(401);
    expect(response.data).toStrictEqual({
      message: 'blocked',
      reason:
        'Response does not match any accept rule, blocking websocket request',
      url: 'http://localhost:9000/server-side-blocked',
    });
  });

  it('block request for valid URL which is not allowed on server with streaming response', async () => {
    const response = await axiosClient.get(
      `http://localhost:${bc.port}/server-side-blocked-streaming`,
    );

    expect(response.status).toEqual(401);
    expect(response.data).toStrictEqual({
      message: 'blocked',
      reason:
        'Response does not match any accept rule, blocking websocket request',
      url: 'http://localhost:9000/server-side-blocked-streaming',
    });
  });

  it('allow request for valid url with valid accept header', async () => {
    const response = await axiosClient.get(
      `http://localhost:${bc.port}/echo-param-protected/xyz`,
      {
        headers: {
          ACCEPT: 'valid.accept.header',
          accept: 'valid.accept.header',
        },
      },
    );

    expect(response.status).toEqual(200);
    expect(response.data).toEqual('xyz');
  });

  it('block request for valid url with invalid accept header', async () => {
    const response = await axiosClient.get(
      `http://localhost:${bc.port}/echo-param-protected/xyz`,
      {
        headers: {
          ACCEPT: 'invalid.accept.header',
          accept: 'invalid.accept.header',
        },
      },
    );

    expect(response.status).toEqual(401);
    expect(response.data).toStrictEqual({
      message: 'blocked',
      reason: 'Request does not match any accept rule, blocking HTTP request',
      url: '/echo-param-protected/xyz',
    });
  });

  it('broker ID is included in headers from server to private', async () => {
    const response = await axiosClient.post(
      `http://localhost:${bc.port}/echo-headers`,
      {},
    );

    expect(response.status).toEqual(200);
    expect(response.data).toHaveProperty('x-broker-token');
    expect(response.data['x-broker-token']).toEqual(brokerToken);
  });

  it('querystring parameters are brokered', async () => {
    const response = await axiosClient.get(
      `http://localhost:${bc.port}/echo-query`,
      {
        params: {
          shape: 'square',
          colour: 'yellow',
        },
      },
    );

    expect(response.status).toEqual(200);
    expect(response.data).toStrictEqual({
      shape: 'square',
      colour: 'yellow',
    });
  });
});
