// noinspection DuplicatedCode

import * as path from 'path';
import axios from 'axios';
import {
  BrokerClient,
  closeBrokerClient,
  createBrokerClient,
} from '../setup/broker-client';
import {
  BrokerServer,
  createBrokerServer,
  waitForBrokerClientConnection,
} from '../setup/broker-server';
import { TestWebServer, createTestWebServer } from '../setup/test-web-server';

const fixtures = path.resolve(__dirname, '..', 'fixtures');
const serverAccept = path.join(fixtures, 'server', 'filters.json');

describe('broker client systemcheck endpoint', () => {
  let tws: TestWebServer;
  let bs: BrokerServer;
  let bc: BrokerClient;

  beforeAll(async () => {
    tws = await createTestWebServer();

    bs = await createBrokerServer({ filters: serverAccept });
  });

  afterAll(async () => {
    await tws.server.close();

    setTimeout(async () => {
      await bs.server.close();
    }, 100);
    await new Promise<void>((resolve) => {
      bs.server.io.on('close', () => {
        resolve();
      });
    });
  });

  afterEach(async () => {
    await closeBrokerClient(bc);
  });

  it('good validation url, custom endpoint, no authorization', async () => {
    bc = await createBrokerClient({
      brokerServerUrl: `http://localhost:${bs.port}`,
      brokerToken: 'broker-token-12345',
      type: 'client',
      brokerClientValidationUrl: 'https://httpbin.org/headers',
      brokerSystemcheckPath: '/custom-systemcheck',
    });
    await waitForBrokerClientConnection(bs);

    const response = await axios.get(
      `http://localhost:${bc.port}/custom-systemcheck`,
      {
        timeout: 10_000,
        validateStatus: () => true,
      },
    );

    expect(response.data).toBeInstanceOf(Array);
    const systemCheckBody = response.data[0];

    expect(response.status).toEqual(200);
    expect(systemCheckBody).toStrictEqual({
      brokerClientValidationMethod: 'GET',
      brokerClientValidationTimeoutMs: expect.any(Number),
      brokerClientValidationUrl: 'https://httpbin.org/headers',
      brokerClientValidationUrlStatusCode: 200,
      maskedCredentials: null,
      ok: true,
      testResponse: expect.any(Object),
    });
    expect(
      systemCheckBody.testResponse.body.headers.Authorization,
    ).not.toBeTruthy();
  });

  it('good validation url, authorization header', async () => {
    bc = await createBrokerClient({
      brokerServerUrl: `http://localhost:${bs.port}`,
      brokerToken: 'broker-token-12345',
      type: 'client',
      brokerClientValidationUrl: 'https://httpbin.org/headers',
      brokerClientValidationAuthorizationHeader:
        'token my-special-access-token',
    });
    await waitForBrokerClientConnection(bs);

    const response = await axios.get(
      `http://localhost:${bc.port}/systemcheck`,
      {
        timeout: 10_000,
        validateStatus: () => true,
      },
    );

    expect(response.data).toBeInstanceOf(Array);
    const systemCheckBody = response.data[0];
    const systemCheckHeaders = systemCheckBody.testResponse.body.headers;

    expect(response.status).toEqual(200);
    expect(systemCheckBody).toStrictEqual({
      brokerClientValidationMethod: 'GET',
      brokerClientValidationTimeoutMs: expect.any(Number),
      brokerClientValidationUrl: 'https://httpbin.org/headers',
      brokerClientValidationUrlStatusCode: 200,
      maskedCredentials: expect.any(String),
      ok: true,
      testResponse: expect.any(Object),
    });
    expect(systemCheckHeaders['User-Agent']).toBeTruthy();
    expect(systemCheckHeaders.Authorization).toEqual(
      'token my-special-access-token',
    );
  });

  it('good validation url, basic auth', async () => {
    bc = await createBrokerClient({
      brokerServerUrl: `http://localhost:${bs.port}`,
      brokerToken: 'broker-token-12345',
      type: 'client',
      brokerClientValidationUrl: 'https://httpbin.org/headers',
      brokerClientValidationBasicAuth: 'username:password',
    });
    await waitForBrokerClientConnection(bs);

    const response = await axios.get(
      `http://localhost:${bc.port}/systemcheck`,
      {
        timeout: 10_000,
        validateStatus: () => true,
      },
    );

    expect(response.data).toBeInstanceOf(Array);
    const systemCheckBody = response.data[0];
    const systemCheckHeaders = systemCheckBody.testResponse.body.headers;

    expect(response.status).toEqual(200);
    expect(systemCheckBody).toStrictEqual({
      brokerClientValidationMethod: 'GET',
      brokerClientValidationTimeoutMs: expect.any(Number),
      brokerClientValidationUrl: 'https://httpbin.org/headers',
      brokerClientValidationUrlStatusCode: 200,
      maskedCredentials: 'use***ord',
      ok: true,
      testResponse: expect.any(Object),
    });
    expect(systemCheckHeaders['User-Agent']).toBeTruthy();
    expect(systemCheckHeaders.Authorization).toEqual(
      `Basic ${Buffer.from('username:password').toString('base64')}`,
    );
  });

  it('good validation url, header auth', async () => {
    bc = await createBrokerClient({
      brokerServerUrl: `http://localhost:${bs.port}`,
      brokerToken: 'broker-token-12345',
      type: 'client',
      brokerClientValidationUrl: 'https://httpbin.org/headers',
      brokerClientValidationAuthorizationHeader: 'token magical_header_123',
    });
    await waitForBrokerClientConnection(bs);

    const response = await axios.get(
      `http://localhost:${bc.port}/systemcheck`,
      {
        timeout: 10_000,
        validateStatus: () => true,
      },
    );

    expect(response.data).toBeInstanceOf(Array);
    const systemCheckBody = response.data[0];
    const systemCheckHeaders = systemCheckBody.testResponse.body.headers;

    expect(response.status).toEqual(200);
    expect(systemCheckBody).toStrictEqual({
      brokerClientValidationMethod: 'GET',
      brokerClientValidationTimeoutMs: expect.any(Number),
      brokerClientValidationUrl: 'https://httpbin.org/headers',
      brokerClientValidationUrlStatusCode: 200,
      maskedCredentials: 'mag***123',
      ok: true,
      testResponse: expect.any(Object),
    });
    expect(systemCheckHeaders['User-Agent']).toBeTruthy();
    expect(systemCheckHeaders.Authorization).toEqual(
      'token magical_header_123',
    );
  });

  it('good validation url, header auth lacking spaces', async () => {
    bc = await createBrokerClient({
      brokerServerUrl: `http://localhost:${bs.port}`,
      brokerToken: 'broker-token-12345',
      type: 'client',
      brokerClientValidationUrl: 'https://httpbin.org/headers',
      brokerClientValidationAuthorizationHeader: 'tokenmagical_header_123',
    });
    await waitForBrokerClientConnection(bs);

    const response = await axios.get(
      `http://localhost:${bc.port}/systemcheck`,
      {
        timeout: 10_000,
        validateStatus: () => true,
      },
    );

    expect(response.data).toBeInstanceOf(Array);
    const systemCheckBody = response.data[0];
    const systemCheckHeaders = systemCheckBody.testResponse.body.headers;

    expect(response.status).toEqual(200);
    expect(systemCheckBody).toStrictEqual({
      brokerClientValidationMethod: 'GET',
      brokerClientValidationTimeoutMs: expect.any(Number),
      brokerClientValidationUrl: 'https://httpbin.org/headers',
      brokerClientValidationUrlStatusCode: 200,
      maskedCredentials: 'tok***123',
      ok: true,
      testResponse: expect.any(Object),
    });
    expect(systemCheckHeaders['User-Agent']).toBeTruthy();
    expect(systemCheckHeaders.Authorization).toEqual('tokenmagical_header_123');
  });

  it('good validation url, basic auth, short creds', async () => {
    bc = await createBrokerClient({
      brokerServerUrl: `http://localhost:${bs.port}`,
      brokerToken: 'broker-token-12345',
      type: 'client',
      brokerClientValidationUrl: 'https://httpbin.org/headers',
      brokerClientValidationBasicAuth: 'use:pw',
    });
    await waitForBrokerClientConnection(bs);

    const response = await axios.get(
      `http://localhost:${bc.port}/systemcheck`,
      {
        timeout: 10_000,
        validateStatus: () => true,
      },
    );

    expect(response.data).toBeInstanceOf(Array);
    const systemCheckBody = response.data[0];

    expect(response.status).toEqual(200);
    expect(systemCheckBody).toStrictEqual({
      brokerClientValidationMethod: 'GET',
      brokerClientValidationTimeoutMs: expect.any(Number),
      brokerClientValidationUrl: 'https://httpbin.org/headers',
      brokerClientValidationUrlStatusCode: 200,
      maskedCredentials: '***',
      ok: true,
      testResponse: expect.any(Object),
    });
  });

  it('good validation url, basic auth, 7 char creds', async () => {
    bc = await createBrokerClient({
      brokerServerUrl: `http://localhost:${bs.port}`,
      brokerToken: 'broker-token-12345',
      type: 'client',
      brokerClientValidationUrl: 'https://httpbin.org/headers',
      brokerClientValidationBasicAuth: 'use:pwd',
    });
    await waitForBrokerClientConnection(bs);

    const response = await axios.get(
      `http://localhost:${bc.port}/systemcheck`,
      {
        timeout: 10_000,
        validateStatus: () => true,
      },
    );

    expect(response.data).toBeInstanceOf(Array);
    const systemCheckBody = response.data[0];

    expect(response.status).toEqual(200);
    expect(systemCheckBody).toStrictEqual({
      brokerClientValidationMethod: 'GET',
      brokerClientValidationTimeoutMs: expect.any(Number),
      brokerClientValidationUrl: 'https://httpbin.org/headers',
      brokerClientValidationUrlStatusCode: 200,
      maskedCredentials: 'use***pwd',
      ok: true,
      testResponse: expect.any(Object),
    });
  });

  it('good validation url, basic auth, both good', async () => {
    bc = await createBrokerClient({
      brokerServerUrl: `http://localhost:${bs.port}`,
      brokerToken: 'broker-token-12345',
      type: 'client',
      brokerClientValidationUrl: 'https://httpbin.org/headers',
      brokerClientValidationBasicAuthPool: [
        'username:password',
        'username1:password1',
      ],
    });
    await waitForBrokerClientConnection(bs);

    const response = await axios.get(
      `http://localhost:${bc.port}/systemcheck`,
      {
        timeout: 10_000,
        validateStatus: () => true,
      },
    );

    expect(response.status).toEqual(200);
    expect(response.data).toBeInstanceOf(Array);

    // first check
    const systemCheckBodyFirst = response.data[0];
    const systemCheckHeadersFirst =
      systemCheckBodyFirst.testResponse.body.headers;
    expect(systemCheckBodyFirst).toStrictEqual({
      brokerClientValidationMethod: 'GET',
      brokerClientValidationTimeoutMs: expect.any(Number),
      brokerClientValidationUrl: 'https://httpbin.org/headers',
      brokerClientValidationUrlStatusCode: 200,
      maskedCredentials: 'use***ord',
      ok: true,
      testResponse: expect.any(Object),
    });
    expect(systemCheckHeadersFirst['User-Agent']).toBeTruthy();
    expect(systemCheckHeadersFirst.Authorization).toEqual(
      `Basic ${Buffer.from('username:password').toString('base64')}`,
    );
    // second check
    const systemCheckBodySecond = response.data[1];
    const systemCheckHeadersSecond =
      systemCheckBodySecond.testResponse.body.headers;
    expect(systemCheckBodySecond).toStrictEqual({
      brokerClientValidationMethod: 'GET',
      brokerClientValidationTimeoutMs: expect.any(Number),
      brokerClientValidationUrl: 'https://httpbin.org/headers',
      brokerClientValidationUrlStatusCode: 200,
      maskedCredentials: 'use***rd1',
      ok: true,
      testResponse: expect.any(Object),
    });
    expect(systemCheckHeadersSecond['User-Agent']).toBeTruthy();
    expect(systemCheckHeadersSecond.Authorization).toEqual(
      `Basic ${Buffer.from('username1:password1').toString('base64')}`,
    );
  });

  it('bad validation url', async () => {
    bc = await createBrokerClient({
      brokerServerUrl: `http://localhost:${bs.port}`,
      brokerToken: 'broker-token-12345',
      type: 'client',
      brokerClientValidationUrl: 'https://snyk.io/no-such-url-ever',
    });
    await waitForBrokerClientConnection(bs);

    const response = await axios.get(
      `http://localhost:${bc.port}/systemcheck`,
      {
        timeout: 10_000,
        validateStatus: () => true,
      },
    );

    expect(response.data).toBeInstanceOf(Array);
    const systemCheckBody = response.data[0];

    expect(response.status).toEqual(500);
    expect(systemCheckBody).toMatchObject({
      brokerClientValidationMethod: 'GET',
      brokerClientValidationUrl: 'https://snyk.io/no-such-url-ever',
      ok: false,
      error: expect.any(String),
    });
  });
});
