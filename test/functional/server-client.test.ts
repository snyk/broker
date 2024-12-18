import path from 'path';
import version from '../../lib/common/utils/version';
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
import { TestWebServer, createTestWebServer } from '../setup/test-web-server';

const fixtures = path.resolve(__dirname, '..', 'fixtures');
const serverAccept = path.join(fixtures, 'server', 'filters.json');
const clientAccept = path.join(fixtures, 'client', 'filters.json');

describe('proxy requests originating from behind the broker server', () => {
  let tws: TestWebServer;
  let bs: BrokerServer;
  let bc: BrokerClient;
  let brokerToken: string;
  let metadata: unknown;
  let brokerToken2: string;
  let metadata2: unknown;

  beforeAll(async () => {
    const PORT = 9999;
    process.env.BROKER_SERVER_URL = `http://localhost:${PORT}`;
    process.env.JIRAUSER = 'user';
    process.env.PASS = 'pass';
    process.env.LOG_ENABLE_BODY = 'true'; // setting this to true to assert it connects with it disabled

    tws = await createTestWebServer();

    bs = await createBrokerServer({ port: PORT, filters: serverAccept });

    bc = await createBrokerClient({
      brokerServerUrl: `${process.env.BROKER_SERVER_URL}`,
      brokerToken: 'broker-token-12345',
      filters: clientAccept,
      type: 'client',
    });
    const connData = await waitForBrokerClientConnections(bs, 2);
    const primaryIndex = connData.metadataArray[0]['role'] == 'primary' ? 0 : 1;
    const secondaryIndex =
      connData.metadataArray[1]['role'] == 'secondary' ? 1 : 0;
    brokerToken = connData.brokerTokens[primaryIndex];
    brokerToken2 = connData.brokerTokens[secondaryIndex];
    metadata = connData.metadataArray[primaryIndex];
    metadata2 = connData.metadataArray[secondaryIndex];
  });

  afterAll(async () => {
    await tws.server.close();
    await closeBrokerClient(bc);
    await closeBrokerServer(bs);
    delete process.env.BROKER_SERVER_URL;
  });

  it('server identifies self to client', async () => {
    expect(brokerToken).toEqual('broker-token-12345');
    expect(metadata).toStrictEqual({
      capabilities: ['post-streams'],
      filters: expect.any(Object),
      clientId: expect.any(String),
      version: version,
      role: 'primary',
      clientConfig: {
        bodyLogMode: false,
        brokerClientId: expect.any(String),
        credPooling: true, //client sets a PASSWORD_POOL
        customAccept: true,
        debugMode: false,
        haMode: false,
        insecureDownstream: false,
        privateCa: false,
        proxy: false,
        tlsReject: false,
        universalBroker: false,
        version: 'local',
      },
      identifier:
        '67f47824f806ee9c2fe6c7cc5849269fc1bc599c18e401ee2e2aea422bab6128',
    });
    expect(brokerToken2).toEqual('broker-token-12345');
    expect(metadata2).toStrictEqual({
      capabilities: ['post-streams'],
      filters: expect.any(Object),
      clientId: expect.any(String),
      version: version,
      role: 'secondary',
      clientConfig: {
        bodyLogMode: false,
        brokerClientId: expect.any(String),
        credPooling: true, //client sets a PASSWORD_POOL
        customAccept: true,
        debugMode: false,
        haMode: false,
        insecureDownstream: false,
        privateCa: false,
        proxy: false,
        tlsReject: false,
        universalBroker: false,
        version: 'local',
      },
      identifier:
        '67f47824f806ee9c2fe6c7cc5849269fc1bc599c18e401ee2e2aea422bab6128',
    });
  });

  it('successfully broker POST', async () => {
    const response = await axiosClient.post(
      `http://localhost:${bs.port}/broker/${brokerToken}/echo-body`,
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
      `http://localhost:${bs.port}/broker/${brokerToken}/echo-body`,
      body,
      {
        headers: {
          'content-type': 'application/json',
        },

        transformResponse: (r) => r,
      },
    );

    expect(response.status).toEqual(200);
    expect(Buffer.from(response.data)).toEqual(body);
  });

  it('successfully broker exact bytes of POST body with WS response', async () => {
    // stringify the JSON unusually to ensure an unusual exact body
    const body = Buffer.from(
      JSON.stringify({ some: { example: 'json' } }, null, 5),
    );
    const response = await axiosClient.post(
      `http://localhost:${bs.port}/broker/${brokerToken}/echo-body`,
      body,
      {
        headers: {
          'content-type': 'application/json',
          'x-broker-ws-response': 'whatever',
        },

        transformResponse: (r) => r,
      },
    );
    expect(response.status).toEqual(200);
    expect(Buffer.from(response.data)).toEqual(body);
    expect(response.headers['x-broker-ws-response']).not.toBeNull();
  });

  it('successfully broker POST with unicode body and header values', async () => {
    const response = await axiosClient.post(
      `http://localhost:${bs.port}/broker/${brokerToken}/echo-with-unicode`,
      { some: { example: 'json' } },
    );
    expect(decodeURIComponent(response.headers.test)).toEqual(
      'Special-Char-碰撞.proj',
    );
    expect(response.status).toEqual(200);
    expect(response.data).toStrictEqual({
      some: { example: 'json' },
      test: 'Special-Char-碰撞.proj',
    });
  });

  it('successfully broker GET', async () => {
    const response = await axiosClient.get(
      `http://localhost:${bs.port}/broker/${brokerToken}/echo-param/xyz`,
    );

    expect(response.headers['x-broker-ws-response']).not.toBeNull();
    expect(response.status).toEqual(200);
    expect(response.data).toEqual('xyz');
  });

  it('successfully broker GET with WS response', async () => {
    const response = await axiosClient.get(
      `http://localhost:${bs.port}/broker/${brokerToken}/echo-param/xyz`,
      { headers: { 'x-broker-ws-response': 'whatever' } },
    );
    expect(response.headers['x-broker-ws-response']).not.toBeNull();
    expect(response.status).toEqual(200);
    expect(response.data).toEqual('xyz');
  });

  it('variable substitution', async () => {
    const response = await axiosClient.post(
      `http://localhost:${bs.port}/broker/${brokerToken}/echo-body`,
      {
        BROKER_VAR_SUB: ['swap.me'],
        swap: { me: '${BROKER_TYPE}:${BROKER_TOKEN}' },
      },
      {
        headers: {
          'content-type': 'application/json',
        },
      },
    );

    expect(response.status).toEqual(200);
    expect(response.data).toStrictEqual({
      swap: { me: 'client:broker-token-12345' },
    });
  });

  it('block request for non-whitelisted url', async () => {
    const response = await axiosClient.post(
      `http://localhost:${bs.port}/broker/${brokerToken}/not-allowed`,
      {},
      {
        headers: {
          'content-type': 'application/json',
        },
      },
    );
    expect(response.status).toEqual(401);
    expect(response.data).toStrictEqual({
      message: 'blocked',
      reason:
        '[Websocket Flow][Blocked Request] Does not match any accept rule',
      url: '/not-allowed',
    });
  });

  it('allow request for valid url with valid body', async () => {
    const response = await axiosClient.post(
      `http://localhost:${bs.port}/broker/${brokerToken}/echo-body/filtered`,
      { proxy: { me: 'please' } },
      {
        headers: {
          'content-type': 'application/json',
        },
      },
    );

    expect(response.status).toEqual(200);
    expect(response.data).toStrictEqual({
      proxy: { me: 'please' },
    });
  });

  it('block request for valid url with invalid body', async () => {
    const response = await axiosClient.post(
      `http://localhost:${bs.port}/broker/${brokerToken}/echo-body/filtered`,
      { proxy: { me: 'now!' } },
      {
        headers: {
          'content-type': 'application/json',
        },
      },
    );

    expect(response.status).toEqual(401);
    expect(response.data).toStrictEqual({
      message: 'blocked',
      reason:
        '[Websocket Flow][Blocked Request] Does not match any accept rule',
      url: '/echo-body/filtered',
    });
  });

  it('allow request for valid url with valid query param', async () => {
    const response = await axiosClient.get(
      `http://localhost:${bs.port}/broker/${brokerToken}/echo-query/filtered`,
      {
        params: { proxyMe: 'please' },
      },
    );

    expect(response.status).toEqual(200);
    expect(response.data).toStrictEqual({ proxyMe: 'please' });
  });

  it('block request for valid url with invalid query param', async () => {
    const response = await axiosClient.get(
      `http://localhost:${bs.port}/broker/${brokerToken}/echo-query/filtered`,
      {
        params: { proxyMe: 'now!' },
      },
    );

    expect(response.status).toEqual(401);
    expect(response.data).toStrictEqual({
      message: 'blocked',
      reason:
        '[Websocket Flow][Blocked Request] Does not match any accept rule',
      url: '/echo-query/filtered?proxyMe=now!',
    });
  });

  it('block request for valid url with missing query param', async () => {
    const response = await axiosClient.get(
      `http://localhost:${bs.port}/broker/${brokerToken}/echo-query/filtered`,
    );

    expect(response.status).toEqual(401);
    expect(response.data).toStrictEqual({
      message: 'blocked',
      reason:
        '[Websocket Flow][Blocked Request] Does not match any accept rule',
      url: '/echo-query/filtered',
    });
  });

  it('bad broker id', async () => {
    const response = await axiosClient.post(
      `http://localhost:${bs.port}/broker/${brokerToken}XXX/echo-body`,
      {},
    );

    expect(response.status).toEqual(404);
  });

  it('broker token is not included in headers from client to private', async () => {
    const response = await axiosClient.post(
      `http://localhost:${bs.port}/broker/${brokerToken}/echo-headers`,
      {},
    );

    expect(response.status).toEqual(200);
    expect(response.data).not.toHaveProperty('x-broker-token');
  });

  it('x-forwarded-* headers are stripped from the request before being forwarded', async () => {
    const response = await axiosClient.post(
      `http://localhost:${bs.port}/broker/${brokerToken}/echo-headers`,
      {},
      {
        headers: {
          'x-forwarded-proto': 'https',
          'x-forwarded-for': '127.0.0.1',
          'x-forwarded-port': '8080',
          'X-Forwarded-Port': '8080',
          'x-forwarded-host': 'banana',
          forwarded:
            'by=broker;for=127.0.0.1;host=banana;port=8080;proto=https',
        },
      },
    );

    expect(response.status).toEqual(200);
    expect(response.data).not.toHaveProperty('x-forwarded-proto');
    expect(response.data).not.toHaveProperty('x-forwarded-for');
    expect(response.data).not.toHaveProperty('x-forwarded-port');
    expect(response.data).not.toHaveProperty('X-Forwarded-Port');
    expect(response.data).not.toHaveProperty('x-forwarded-host');
    expect(response.data).not.toHaveProperty('forwarded');
  });

  it('querystring parameters are brokered', async () => {
    const response = await axiosClient.get(
      `http://localhost:${bs.port}/broker/${brokerToken}/echo-query`,
      {
        params: {
          shape: 'square',
          colour: 'yellow',
          url_as_param: 'https://clojars.org/search?q=btc',
          one_more_top_level_param: 'true',
        },
      },
    );

    expect(response.status).toEqual(200);
    expect(response.data).toStrictEqual({
      shape: 'square',
      colour: 'yellow',
      url_as_param: 'https://clojars.org/search?q=btc',
      one_more_top_level_param: 'true',
    });
  });

  it('approved URLs are blocked when escaped', async () => {
    const response = await axiosClient.get(
      `http://localhost:${bs.port}/broker/${brokerToken}/long/nested%2Fpath%2Fto%2Ffile.ext`,
    );

    expect(response.status).toEqual(401);
    expect(response.data).toStrictEqual({
      message: 'blocked',
      reason:
        '[Websocket Flow][Blocked Request] Does not match any accept rule',
      url: '/long/nested%2Fpath%2Fto%2Ffile.ext',
    });
  });

  it('block request for url where client does not support required capability', async () => {
    const response = await axiosClient.get(
      `http://localhost:${bs.port}/broker/${brokerToken}/client-not-capable`,
    );

    expect(response.status).toEqual(401);
    expect(response.data).toStrictEqual({
      message: 'blocked',
      reason: 'Request does not match any accept rule, blocking HTTP request',
      url: '/client-not-capable',
    });
  });

  it('approved URLs are brokered when escaped as expected', async () => {
    const response = await axiosClient.get(
      `http://localhost:${bs.port}/broker/${brokerToken}/long/nested/partially/encoded%2Fpath%2Fto%2Ffile.ext`,
    );

    expect(response.status).toEqual(200);
    expect(response.data).toEqual(
      '/long/nested/partially/encoded%2Fpath%2Fto%2Ffile.ext',
    );
  });

  it('content-length is not set when using chunked http', async () => {
    const response = await axiosClient.get(
      `http://localhost:${bs.port}/broker/${brokerToken}/echo-headers`,
      {
        headers: {
          'Transfer-Encoding': 'chunked',
        },
      },
    );

    expect(response.headers).not.toHaveProperty('content-length');
  });

  it('content-length is set without chunked http', async () => {
    const response = await axiosClient.post(
      `http://localhost:${bs.port}/broker/${brokerToken}/echo-headers`,
      {},
    );

    expect(response.headers).toHaveProperty('content-length');
  });

  it('auth header is replaced when url contains token', async () => {
    const response = await axiosClient.post(
      `http://localhost:${bs.port}/broker/${brokerToken}/echo-headers/github`,
      {},
      {
        headers: {
          Authorization: 'broker auth',
        },
      },
    );

    expect(response.status).toEqual(200);
    expect(response.data).toHaveProperty('authorization');
    expect(response.data.authorization).toEqual('token githubToken');
  });

  it('auth header is is replaced when url contains basic auth', async () => {
    const response = await axiosClient.post(
      `http://localhost:${bs.port}/broker/${brokerToken}/echo-headers/bitbucket`,
      {},
    );
    const auth = response.data.authorization?.replace('Basic ', '');
    const encodedAuth = Buffer.from(auth, 'base64').toString('utf-8');

    expect(response.status).toEqual(200);
    expect(response.data).toHaveProperty('authorization');
    expect(encodedAuth).toEqual('bitbucketUser:bitbucketPassword');
  });

  it('successfully broker on endpoint that forwards requests with basic auth', async () => {
    const response = await axiosClient.get(
      `http://localhost:${bs.port}/broker/${brokerToken}/basic-auth`,
    );
    const auth = response.data.replace('Basic ', '');
    const encodedAuth = Buffer.from(auth, 'base64').toString('utf-8');

    expect(response.status).toEqual(200);
    expect(encodedAuth).toEqual('user:pass');
  });

  it('ignores accept-encoding (gzip)', async () => {
    const paramRequiringCompression = 'hello-'.repeat(200);
    const response = await axiosClient.get(
      `http://localhost:${bs.port}/broker/${brokerToken}/echo-param/${paramRequiringCompression}`,
      {
        headers: {
          'Accept-Encoding': 'gzip',
        },
      },
    );

    expect(response.status).toEqual(200);
    expect(response.data).toEqual(paramRequiringCompression);
  });

  it('ignores accept-encoding (deflate)', async () => {
    const paramRequiringCompression = 'hello-'.repeat(200);
    const response = await axiosClient.get(
      `http://localhost:${bs.port}/broker/${brokerToken}/echo-param/${paramRequiringCompression}`,
      {
        headers: {
          'Accept-Encoding': 'deflate',
        },
      },
    );

    expect(response.status).toEqual(200);
    expect(response.data).toEqual(paramRequiringCompression);
  });

  it('successfully stream data', async () => {
    const response = await axiosClient.get(
      `http://localhost:${bs.port}/broker/${brokerToken}/test-blob/1`,
      {
        headers: {},
      },
    );
    const buf = Buffer.alloc(500);
    for (let i = 0; i < 500; i++) {
      buf.writeUInt8(i & 0xff, i);
    }

    expect(response.status).toEqual(299);
    expect(response.headers).toHaveProperty('test-orig-url');
    expect(response.headers['test-orig-url']).toEqual('/test-blob/1');
    expect(response.data).toEqual(String(buf));
  });

  it('successfully redirect POST request to git client', async () => {
    const response = await axiosClient.post(
      `http://localhost:${bs.port}/broker/${brokerToken}/snykgit/echo-body`,
      { some: { example: 'json' } },
      {
        headers: {
          'content-type': 'application/json',
        },
      },
    );

    expect(response.status).toEqual(200);
    expect(response.data).toStrictEqual({
      some: { example: 'json' },
    });
  });

  it('successfully redirect exact bytes of POST body to git client', async () => {
    const body = Buffer.from(
      JSON.stringify({ some: { example: 'json' } }, null, 5),
    );
    const response = await axiosClient.post(
      `http://localhost:${bs.port}/broker/${brokerToken}/snykgit/echo-body`,
      body,
      {
        headers: {
          'content-type': 'application/json',
        },

        transformResponse: (r) => r,
      },
    );

    expect(response.status).toEqual(200);
    expect(Buffer.from(response.data)).toEqual(body);
  });

  it('successfully redirect exact bytes of POST body to git client', async () => {
    const response = await axiosClient.get(
      `http://localhost:${bs.port}/broker/${brokerToken}/snykgit/echo-param/xyz`,
    );

    expect(response.status).toEqual(200);
    expect(response.data).toEqual('xyz');
  });

  it('accept large responses', async () => {
    const response = await axiosClient.get(
      `http://localhost:${bs.port}/broker/${brokerToken}/huge-file`,
    );

    expect(response.status).toEqual(200);
    expect(response.data.data.length).toEqual(20971522);
  });

  it('allow request to git client with valid param', async () => {
    const response = await axiosClient.get(
      `http://localhost:${bs.port}/broker/${brokerToken}/snykgit/echo-query`,
      {
        params: {
          proxyMe: 'please',
        },
      },
    );

    expect(response.status).toEqual(200);
    expect(response.data).toStrictEqual({ proxyMe: 'please' });
  });

  it('successfully broker POST removing connection_role QS', async () => {
    const response = await axiosClient.get(
      `http://localhost:${bs.port}/broker/${brokerToken}/echo-query?connection_role=primary&test=value&test2=value2`,
    );
    expect(response.status).toEqual(200);
    expect(response.data).toStrictEqual({ test: 'value', test2: 'value2' });
  });
});
