// noinspection DuplicatedCode

import * as path from 'path';
import axios from 'axios';
import { BrokerClient, createBrokerClient } from '../setup/broker-client';
import { BrokerServer, createBrokerServer } from '../setup/broker-server';
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

    await new Promise((resolve) => {
      bs.server.io.on('connection', (socket) => {
        socket.on('identify', (clientData) => {
          brokerToken = clientData.token;
          resolve(brokerToken);
        });
      });
    });
  });

  afterAll(async () => {
    await tws.server.close();
    setTimeout(async () => {
      await bc.client.close();
    }, 100);
    await new Promise<void>((resolve) => {
      bc.client.io.on('close', () => {
        resolve();
      });
    });

    setTimeout(async () => {
      await bs.server.close();
    }, 100);
    await new Promise<void>((resolve) => {
      bs.server.io.on('close', () => {
        resolve();
      });
    });
  });

  it('server identifies self to client', async () => {
    await new Promise((resolve) => {
      bc.client.io.on('identify', (serverData) => {
        serverMetadata = serverData;
        resolve(serverData);
      });
    });

    expect(brokerToken).toEqual('broker-token-12345');
    expect(serverMetadata).toMatchObject({
      capabilities: ['receive-post-streams'],
    });
  });

  it('successfully broker POST', async () => {
    const response = await axios.post(
      `http://localhost:${bc.port}/echo-body`,
      { some: { example: 'json' } },
      {
        timeout: 1000,
        validateStatus: () => true,
      },
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
    const response = await axios.post(
      `http://localhost:${bc.port}/echo-body`,
      body,
      {
        headers: { 'content-type': 'application/json' },
        timeout: 1000,
        transformResponse: (r) => r,
        validateStatus: () => true,
      },
    );

    expect(response.status).toEqual(200);
    expect(Buffer.from(response.data)).toEqual(body);
  });

  it('successfully broker GET', async () => {
    const response = await axios.get(
      `http://localhost:${bc.port}/echo-param/xyz`,
      {
        timeout: 1000,
        validateStatus: () => true,
      },
    );

    expect(response.status).toEqual(200);
    expect(response.data).toEqual('xyz');
  });

  it('block request for non-whitelisted url', async () => {
    const response = await axios.post(
      `http://localhost:${bc.port}/not-allowed`,
      {},
      {
        timeout: 1000,
        validateStatus: () => true,
      },
    );

    expect(response.status).toEqual(401);
    expect(response.data).toStrictEqual({
      message: 'blocked',
      reason: 'Request does not match any accept rule, blocking HTTP request',
      url: '/not-allowed',
    });
  });

  it('allow request for valid url with valid body', async () => {
    const response = await axios.post(
      `http://localhost:${bc.port}/echo-body/filtered`,
      { proxy: { me: 'please' } },
      {
        timeout: 1000,
        validateStatus: () => true,
      },
    );

    expect(response.status).toEqual(200);
    expect(response.data).toStrictEqual({
      proxy: { me: 'please' },
    });
  });

  it('block request for valid url with invalid body', async () => {
    const response = await axios.post(
      `http://localhost:${bc.port}/echo-body/filtered`,
      { proxy: { me: 'now!' } },
      {
        timeout: 1000,
        validateStatus: () => true,
      },
    );

    expect(response.status).toEqual(401);
    expect(response.data).toStrictEqual({
      message: 'blocked',
      reason: 'Request does not match any accept rule, blocking HTTP request',
      url: '/echo-body/filtered',
    });
  });

  it('allow request for valid url with valid query param', async () => {
    const response = await axios.get(
      `http://localhost:${bc.port}/echo-query/filtered`,
      {
        params: { proxyMe: 'please' },
        timeout: 1000,
        validateStatus: () => true,
      },
    );

    expect(response.status).toEqual(200);
    expect(response.data).toStrictEqual({
      proxyMe: 'please',
    });
  });

  it('block request for valid url with invalid query param', async () => {
    const response = await axios.get(
      `http://localhost:${bc.port}/echo-query/filtered`,
      {
        params: { proxyMe: 'now!' },
        timeout: 1000,
        validateStatus: () => true,
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
    const response = await axios.get(
      `http://localhost:${bc.port}/echo-query/filtered`,
      {
        timeout: 1000,
        validateStatus: () => true,
      },
    );

    expect(response.status).toEqual(401);
    expect(response.data).toStrictEqual({
      message: 'blocked',
      reason: 'Request does not match any accept rule, blocking HTTP request',
      url: '/echo-query/filtered',
    });
  });

  it('block request for valid URL which is not allowed on server', async () => {
    const response = await axios.get(
      `http://localhost:${bc.port}/server-side-blocked`,
      {
        timeout: 1000,
        validateStatus: () => true,
      },
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
    const response = await axios.get(
      `http://localhost:${bc.port}/server-side-blocked-streaming`,
      {
        timeout: 1000,
        validateStatus: () => true,
      },
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
    const response = await axios.get(
      `http://localhost:${bc.port}/echo-param-protected/xyz`,
      {
        headers: {
          ACCEPT: 'valid.accept.header',
          accept: 'valid.accept.header',
        },
        timeout: 1000,
        validateStatus: () => true,
      },
    );

    expect(response.status).toEqual(200);
    expect(response.data).toEqual('xyz');
  });

  it('block request for valid url with invalid accept header', async () => {
    const response = await axios.get(
      `http://localhost:${bc.port}/echo-param-protected/xyz`,
      {
        headers: {
          ACCEPT: 'invalid.accept.header',
          accept: 'invalid.accept.header',
        },
        timeout: 1000,
        validateStatus: () => true,
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
    const response = await axios.post(
      `http://localhost:${bc.port}/echo-headers`,
      {},
      {
        timeout: 1000,
        validateStatus: () => true,
      },
    );

    expect(response.status).toEqual(200);
    expect(response.data).toHaveProperty('x-broker-token');
    expect(response.data['x-broker-token']).toEqual(brokerToken);
  });

  it('querystring parameters are brokered', async () => {
    const response = await axios.get(`http://localhost:${bc.port}/echo-query`, {
      params: {
        shape: 'square',
        colour: 'yellow',
      },
      timeout: 1000,
      validateStatus: () => true,
    });

    expect(response.status).toEqual(200);
    expect(response.data).toStrictEqual({
      shape: 'square',
      colour: 'yellow',
    });
  });
});
