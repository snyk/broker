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
  closeBrokerServer,
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
    await closeBrokerServer(bs);
  });

  afterEach(async () => {
    await closeBrokerClient(bc);
  });

  it('good validation url, custom endpoint, no authorization', async () => {
    bc = await createBrokerClient({
      brokerServerUrl: `http://localhost:${bs.port}`,
      brokerToken: 'broker-token-12345',
      type: 'client',
      brokerClientValidationUrl: `http://localhost:${tws.port}/echo-headers/httpbin`,
      brokerSystemcheckPath: '/custom-systemcheck',
    });
    await waitForBrokerClientConnection(bs);

    const response = await axios.get(
      `http://localhost:${bc.port}/custom-systemcheck`,
      {
        timeout: 1000,
        validateStatus: () => true,
      },
    );

    expect(response.data).toBeInstanceOf(Array);
    const systemCheckBody = response.data[0];

    expect(response.status).toEqual(200);
    expect(systemCheckBody).toStrictEqual({
      brokerClientValidationMethod: 'GET',
      brokerClientValidationTimeoutMs: expect.any(Number),
      brokerClientValidationUrl: `http://localhost:${tws.port}/echo-headers/httpbin`,
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
      brokerClientValidationUrl: `http://localhost:${tws.port}/echo-headers/httpbin`,
      brokerClientValidationAuthorizationHeader:
        'token my-special-access-token',
    });
    await waitForBrokerClientConnection(bs);

    const response = await axios.get(
      `http://localhost:${bc.port}/systemcheck`,
      {
        timeout: 1000,
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
      brokerClientValidationUrl: `http://localhost:${tws.port}/echo-headers/httpbin`,
      brokerClientValidationUrlStatusCode: 200,
      maskedCredentials: expect.any(String),
      ok: true,
      testResponse: expect.any(Object),
    });
    expect(systemCheckHeaders['user-agent']).toBeTruthy();
    expect(systemCheckHeaders.authorization).toEqual(
      'token my-special-access-token',
    );
  });

  it('good validation url, basic auth', async () => {
    bc = await createBrokerClient({
      brokerServerUrl: `http://localhost:${bs.port}`,
      brokerToken: 'broker-token-12345',
      type: 'client',
      brokerClientValidationUrl: `http://localhost:${tws.port}/echo-headers/httpbin`,
      brokerClientValidationBasicAuth: 'username:password',
    });
    await waitForBrokerClientConnection(bs);

    const response = await axios.get(
      `http://localhost:${bc.port}/systemcheck`,
      {
        timeout: 1000,
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
      brokerClientValidationUrl: `http://localhost:${tws.port}/echo-headers/httpbin`,
      brokerClientValidationUrlStatusCode: 200,
      maskedCredentials: 'use***ord',
      ok: true,
      testResponse: expect.any(Object),
    });
    expect(systemCheckHeaders['user-agent']).toBeTruthy();
    expect(systemCheckHeaders.authorization).toEqual(
      `Basic ${Buffer.from('username:password').toString('base64')}`,
    );
  });

  it('good validation url, header auth', async () => {
    bc = await createBrokerClient({
      brokerServerUrl: `http://localhost:${bs.port}`,
      brokerToken: 'broker-token-12345',
      type: 'client',
      brokerClientValidationUrl: `http://localhost:${tws.port}/echo-headers/httpbin`,
      brokerClientValidationAuthorizationHeader: 'token magical_header_123',
    });
    await waitForBrokerClientConnection(bs);

    const response = await axios.get(
      `http://localhost:${bc.port}/systemcheck`,
      {
        timeout: 1000,
        validateStatus: () => true,
      },
    );

    expect(response.data).toBeInstanceOf(Array);
    const systemCheckBody = response.data[0];
    const systemCheckHeaders = systemCheckBody.testResponse.body.headers;

    console.log(systemCheckHeaders);

    expect(response.status).toEqual(200);
    expect(systemCheckBody).toStrictEqual({
      brokerClientValidationMethod: 'GET',
      brokerClientValidationTimeoutMs: expect.any(Number),
      brokerClientValidationUrl: `http://localhost:${tws.port}/echo-headers/httpbin`,
      brokerClientValidationUrlStatusCode: 200,
      maskedCredentials: 'mag***123',
      ok: true,
      testResponse: expect.any(Object),
    });
    expect(systemCheckHeaders['user-agent']).toBeTruthy();
    expect(systemCheckHeaders.authorization).toEqual(
      'token magical_header_123',
    );
  });

  it('good validation url, header auth lacking spaces', async () => {
    bc = await createBrokerClient({
      brokerServerUrl: `http://localhost:${bs.port}`,
      brokerToken: 'broker-token-12345',
      type: 'client',
      brokerClientValidationUrl: `http://localhost:${tws.port}/echo-headers/httpbin`,
      brokerClientValidationAuthorizationHeader: 'tokenmagical_header_123',
    });
    await waitForBrokerClientConnection(bs);

    const response = await axios.get(
      `http://localhost:${bc.port}/systemcheck`,
      {
        timeout: 1000,
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
      brokerClientValidationUrl: `http://localhost:${tws.port}/echo-headers/httpbin`,
      brokerClientValidationUrlStatusCode: 200,
      maskedCredentials: 'tok***123',
      ok: true,
      testResponse: expect.any(Object),
    });
    expect(systemCheckHeaders['user-agent']).toBeTruthy();
    expect(systemCheckHeaders.authorization).toEqual('tokenmagical_header_123');
  });

  it('good validation url, basic auth, short creds', async () => {
    bc = await createBrokerClient({
      brokerServerUrl: `http://localhost:${bs.port}`,
      brokerToken: 'broker-token-12345',
      type: 'client',
      brokerClientValidationUrl: `http://localhost:${tws.port}/echo-headers/httpbin`,
      brokerClientValidationBasicAuth: 'use:pw',
    });
    await waitForBrokerClientConnection(bs);

    const response = await axios.get(
      `http://localhost:${bc.port}/systemcheck`,
      {
        timeout: 1000,
        validateStatus: () => true,
      },
    );

    expect(response.data).toBeInstanceOf(Array);
    const systemCheckBody = response.data[0];

    expect(response.status).toEqual(200);
    expect(systemCheckBody).toStrictEqual({
      brokerClientValidationMethod: 'GET',
      brokerClientValidationTimeoutMs: expect.any(Number),
      brokerClientValidationUrl: `http://localhost:${tws.port}/echo-headers/httpbin`,
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
      brokerClientValidationUrl: `http://localhost:${tws.port}/echo-headers/httpbin`,
      brokerClientValidationBasicAuth: 'use:pwd',
    });
    await waitForBrokerClientConnection(bs);

    const response = await axios.get(
      `http://localhost:${bc.port}/systemcheck`,
      {
        timeout: 1000,
        validateStatus: () => true,
      },
    );

    expect(response.data).toBeInstanceOf(Array);
    const systemCheckBody = response.data[0];

    expect(response.status).toEqual(200);
    expect(systemCheckBody).toStrictEqual({
      brokerClientValidationMethod: 'GET',
      brokerClientValidationTimeoutMs: expect.any(Number),
      brokerClientValidationUrl: `http://localhost:${tws.port}/echo-headers/httpbin`,
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
      brokerClientValidationUrl: `http://localhost:${tws.port}/echo-headers/httpbin`,
      brokerClientValidationBasicAuthPool: [
        'username:password',
        'username1:password1',
      ],
    });
    await waitForBrokerClientConnection(bs);

    const response = await axios.get(
      `http://localhost:${bc.port}/systemcheck`,
      {
        timeout: 1000,
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
      brokerClientValidationUrl: `http://localhost:${tws.port}/echo-headers/httpbin`,
      brokerClientValidationUrlStatusCode: 200,
      maskedCredentials: 'use***ord',
      ok: true,
      testResponse: expect.any(Object),
    });
    expect(systemCheckHeadersFirst['user-agent']).toBeTruthy();
    expect(systemCheckHeadersFirst.authorization).toEqual(
      `Basic ${Buffer.from('username:password').toString('base64')}`,
    );
    // second check
    const systemCheckBodySecond = response.data[1];
    const systemCheckHeadersSecond =
      systemCheckBodySecond.testResponse.body.headers;
    expect(systemCheckBodySecond).toStrictEqual({
      brokerClientValidationMethod: 'GET',
      brokerClientValidationTimeoutMs: expect.any(Number),
      brokerClientValidationUrl: `http://localhost:${tws.port}/echo-headers/httpbin`,
      brokerClientValidationUrlStatusCode: 200,
      maskedCredentials: 'use***rd1',
      ok: true,
      testResponse: expect.any(Object),
    });
    expect(systemCheckHeadersSecond['user-agent']).toBeTruthy();
    expect(systemCheckHeadersSecond.authorization).toEqual(
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
