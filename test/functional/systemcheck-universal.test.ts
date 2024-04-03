import path from 'path';
import { axiosClient } from '../setup/axios-client';
import { BrokerClient, closeBrokerClient } from '../setup/broker-client';
import {
  BrokerServer,
  closeBrokerServer,
  createBrokerServer,
  waitForUniversalBrokerClientsConnection,
} from '../setup/broker-server';
import { TestWebServer, createTestWebServer } from '../setup/test-web-server';
import { createUniversalBrokerClient } from '../setup/broker-universal-client';

const fixtures = path.resolve(__dirname, '..', 'fixtures');
const serverAccept = path.join(fixtures, 'server', 'filters.json');
const clientAccept = path.join(fixtures, 'client', 'filters.json');

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
    delete process.env.BROKER_SERVER_URL;
  });

  afterEach(async () => {
    await closeBrokerClient(bc);
    delete process.env.SNYK_BROKER_SERVER_UNIVERSAL_CONFIG_ENABLED;
    delete process.env.UNIVERSAL_BROKER_ENABLED;
    delete process.env.SERVICE_ENV;
    delete process.env.BROKER_TOKEN_1;
    delete process.env.BROKER_TOKEN_2;
    delete process.env.BROKER_TOKEN_3;
    delete process.env.BROKER_TOKEN_4;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITLAB_TOKEN;
    delete process.env.BROKER_HEALTHCHECK_PATH;

    delete process.env
      .SNYK_BROKER_CLIENT_CONFIGURATION__common__default__BROKER_SERVER_URL;
    delete process.env.SNYK_FILTER_RULES_PATHS__github;
    delete process.env.SNYK_FILTER_RULES_PATHS__gitlab;
  });

  it('good validation url, custom endpoint, no authorization', async () => {
    process.env.SNYK_BROKER_SERVER_UNIVERSAL_CONFIG_ENABLED = 'true';
    process.env.UNIVERSAL_BROKER_ENABLED = 'true';
    process.env.SERVICE_ENV = 'universaltest';
    process.env.BROKER_TOKEN_1 = 'brokertoken1';
    process.env.BROKER_TOKEN_2 = 'brokertoken2';
    process.env.BROKER_TOKEN_3 = 'brokertoken3';
    process.env.BROKER_TOKEN_4 = 'brokertoken4';
    process.env.JIRA_PAT = 'jirapat';
    process.env.JIRA_HOSTNAME = 'hostname';
    process.env.GITHUB_TOKEN = 'ghtoken';
    process.env.GITLAB_TOKEN = 'gltoken';
    process.env.BROKER_HEALTHCHECK_PATH = '/custom-systemcheck';
    process.env.AZURE_REPOS_TOKEN = '123';
    process.env.AZURE_REPOS_HOST = 'hostname';
    process.env.AZURE_REPOS_ORG = 'org';
    process.env.CLIENT_ID = 'clienid';
    process.env.CLIENT_SECRET = 'clientsecret';

    process.env.SNYK_BROKER_CLIENT_CONFIGURATION__common__default__BROKER_SERVER_URL = `http://localhost:${bs.port}`;
    process.env.SNYK_FILTER_RULES_PATHS__github = clientAccept;
    process.env.SNYK_FILTER_RULES_PATHS__gitlab = clientAccept;
    bc = await createUniversalBrokerClient();
    await waitForUniversalBrokerClientsConnection(bs, 2);

    const response = await axiosClient.get(
      `http://localhost:${bc.port}/custom-systemcheck`,
    );
    expect(response.data).toBeInstanceOf(Array);
    const systemCheckBody = response.data[0];
    expect(response.status).toEqual(200);
    expect(systemCheckBody).toEqual(
      expect.objectContaining({
        brokerServerUrl: 'http://localhost:9500/?connection_role=primary',
        friendlyName: 'my github connection',
        identifier: 'brok-...-ken1',
        ok: true,
        version: 'local',
        websocketConnectionOpen: true,
      }),
    );
    delete process.env.CLIENT_ID;
    delete process.env.CLIENT_SECRET;
  });

  // it('good validation url, custom endpoint, no authorization, no json response', async () => {
  //   bc = await createBrokerClient({
  //     brokerServerUrl: `http://localhost:${bs.port}`,
  //     brokerToken: 'broker-token-12345',
  //     type: 'client',
  //     brokerClientValidationUrl: `http://localhost:${tws.port}/echo/textresponse`,
  //     brokerSystemcheckPath: '/custom-systemcheck',
  //     filters: clientAccept,
  //   });
  //   await waitForBrokerClientConnection(bs);

  //   const response = await axiosClient.get(
  //     `http://localhost:${bc.port}/custom-systemcheck`,
  //   );
  //   expect(response.data).toBeInstanceOf(Array);
  //   const systemCheckBody = response.data[0];
  //   expect(response.status).toEqual(200);
  //   expect(systemCheckBody).toStrictEqual({
  //     brokerClientValidationMethod: 'GET',
  //     brokerClientValidationTimeoutMs: expect.any(Number),
  //     brokerClientValidationUrl: `http://localhost:${tws.port}/echo/textresponse`,
  //     brokerClientValidationUrlStatusCode: 200,
  //     maskedCredentials: null,
  //     ok: true,
  //     testResponse: expect.any(Object),
  //   });
  //   expect(systemCheckBody.testResponse.body).toEqual('OK');
  // });

  // it('good validation url, authorization header', async () => {
  //   bc = await createBrokerClient({
  //     brokerServerUrl: `http://localhost:${bs.port}`,
  //     brokerToken: 'broker-token-12345',
  //     type: 'client',
  //     brokerClientValidationUrl: `http://localhost:${tws.port}/echo-headers/httpbin`,
  //     brokerClientValidationAuthorizationHeader:
  //       'token my-special-access-token',
  //     filters: clientAccept,
  //   });
  //   await waitForBrokerClientConnection(bs);

  //   const response = await axiosClient.get(
  //     `http://localhost:${bc.port}/systemcheck`,
  //   );

  //   expect(response.data).toBeInstanceOf(Array);
  //   const systemCheckBody = response.data[0];
  //   const systemCheckHeaders = systemCheckBody.testResponse.body.headers;

  //   expect(response.status).toEqual(200);
  //   expect(systemCheckBody).toStrictEqual({
  //     brokerClientValidationMethod: 'GET',
  //     brokerClientValidationTimeoutMs: expect.any(Number),
  //     brokerClientValidationUrl: `http://localhost:${tws.port}/echo-headers/httpbin`,
  //     brokerClientValidationUrlStatusCode: 200,
  //     maskedCredentials: expect.any(String),
  //     ok: true,
  //     testResponse: expect.any(Object),
  //   });
  //   expect(systemCheckHeaders['user-agent']).toBeTruthy();
  //   expect(systemCheckHeaders.authorization).toEqual(
  //     'token my-special-access-token',
  //   );
  // });

  // it('good validation url, basic auth', async () => {
  //   bc = await createBrokerClient({
  //     brokerServerUrl: `http://localhost:${bs.port}`,
  //     brokerToken: 'broker-token-12345',
  //     type: 'client',
  //     brokerClientValidationUrl: `http://localhost:${tws.port}/echo-headers/httpbin`,
  //     brokerClientValidationBasicAuth: 'username:password',
  //     filters: clientAccept,
  //   });
  //   await waitForBrokerClientConnection(bs);

  //   const response = await axiosClient.get(
  //     `http://localhost:${bc.port}/systemcheck`,
  //   );

  //   expect(response.data).toBeInstanceOf(Array);
  //   const systemCheckBody = response.data[0];
  //   const systemCheckHeaders = systemCheckBody.testResponse.body.headers;

  //   expect(response.status).toEqual(200);
  //   expect(systemCheckBody).toStrictEqual({
  //     brokerClientValidationMethod: 'GET',
  //     brokerClientValidationTimeoutMs: expect.any(Number),
  //     brokerClientValidationUrl: `http://localhost:${tws.port}/echo-headers/httpbin`,
  //     brokerClientValidationUrlStatusCode: 200,
  //     maskedCredentials: 'use***ord',
  //     ok: true,
  //     testResponse: expect.any(Object),
  //   });
  //   expect(systemCheckHeaders['user-agent']).toBeTruthy();
  //   expect(systemCheckHeaders.authorization).toEqual(
  //     `Basic ${Buffer.from('username:password').toString('base64')}`,
  //   );
  // });

  // it('good validation url, header auth', async () => {
  //   bc = await createBrokerClient({
  //     brokerServerUrl: `http://localhost:${bs.port}`,
  //     brokerToken: 'broker-token-12345',
  //     type: 'client',
  //     brokerClientValidationUrl: `http://localhost:${tws.port}/echo-headers/httpbin`,
  //     brokerClientValidationAuthorizationHeader: 'token magical_header_123',
  //     filters: clientAccept,
  //   });
  //   await waitForBrokerClientConnection(bs);

  //   const response = await axiosClient.get(
  //     `http://localhost:${bc.port}/systemcheck`,
  //   );

  //   expect(response.data).toBeInstanceOf(Array);
  //   const systemCheckBody = response.data[0];
  //   const systemCheckHeaders = systemCheckBody.testResponse.body.headers;

  //   expect(response.status).toEqual(200);
  //   expect(systemCheckBody).toStrictEqual({
  //     brokerClientValidationMethod: 'GET',
  //     brokerClientValidationTimeoutMs: expect.any(Number),
  //     brokerClientValidationUrl: `http://localhost:${tws.port}/echo-headers/httpbin`,
  //     brokerClientValidationUrlStatusCode: 200,
  //     maskedCredentials: 'mag***123',
  //     ok: true,
  //     testResponse: expect.any(Object),
  //   });
  //   expect(systemCheckHeaders['user-agent']).toBeTruthy();
  //   expect(systemCheckHeaders.authorization).toEqual(
  //     'token magical_header_123',
  //   );
  // });

  // it('good validation url, header auth lacking spaces', async () => {
  //   bc = await createBrokerClient({
  //     brokerServerUrl: `http://localhost:${bs.port}`,
  //     brokerToken: 'broker-token-12345',
  //     type: 'client',
  //     brokerClientValidationUrl: `http://localhost:${tws.port}/echo-headers/httpbin`,
  //     brokerClientValidationAuthorizationHeader: 'tokenmagical_header_123',
  //     filters: clientAccept,
  //   });
  //   await waitForBrokerClientConnection(bs);

  //   const response = await axiosClient.get(
  //     `http://localhost:${bc.port}/systemcheck`,
  //   );

  //   expect(response.data).toBeInstanceOf(Array);
  //   const systemCheckBody = response.data[0];
  //   const systemCheckHeaders = systemCheckBody.testResponse.body.headers;

  //   expect(response.status).toEqual(200);
  //   expect(systemCheckBody).toStrictEqual({
  //     brokerClientValidationMethod: 'GET',
  //     brokerClientValidationTimeoutMs: expect.any(Number),
  //     brokerClientValidationUrl: `http://localhost:${tws.port}/echo-headers/httpbin`,
  //     brokerClientValidationUrlStatusCode: 200,
  //     maskedCredentials: 'tok***123',
  //     ok: true,
  //     testResponse: expect.any(Object),
  //   });
  //   expect(systemCheckHeaders['user-agent']).toBeTruthy();
  //   expect(systemCheckHeaders.authorization).toEqual('tokenmagical_header_123');
  // });

  // it('good validation url, basic auth, short creds', async () => {
  //   bc = await createBrokerClient({
  //     brokerServerUrl: `http://localhost:${bs.port}`,
  //     brokerToken: 'broker-token-12345',
  //     type: 'client',
  //     brokerClientValidationUrl: `http://localhost:${tws.port}/echo-headers/httpbin`,
  //     brokerClientValidationBasicAuth: 'use:pw',
  //     filters: clientAccept,
  //   });
  //   await waitForBrokerClientConnection(bs);

  //   const response = await axiosClient.get(
  //     `http://localhost:${bc.port}/systemcheck`,
  //   );

  //   expect(response.data).toBeInstanceOf(Array);
  //   const systemCheckBody = response.data[0];

  //   expect(response.status).toEqual(200);
  //   expect(systemCheckBody).toStrictEqual({
  //     brokerClientValidationMethod: 'GET',
  //     brokerClientValidationTimeoutMs: expect.any(Number),
  //     brokerClientValidationUrl: `http://localhost:${tws.port}/echo-headers/httpbin`,
  //     brokerClientValidationUrlStatusCode: 200,
  //     maskedCredentials: '***',
  //     ok: true,
  //     testResponse: expect.any(Object),
  //   });
  // });

  // it('good validation url, basic auth, 7 char creds', async () => {
  //   bc = await createBrokerClient({
  //     brokerServerUrl: `http://localhost:${bs.port}`,
  //     brokerToken: 'broker-token-12345',
  //     type: 'client',
  //     brokerClientValidationUrl: `http://localhost:${tws.port}/echo-headers/httpbin`,
  //     brokerClientValidationBasicAuth: 'use:pwd',
  //     filters: clientAccept,
  //   });
  //   await waitForBrokerClientConnection(bs);

  //   const response = await axiosClient.get(
  //     `http://localhost:${bc.port}/systemcheck`,
  //   );

  //   expect(response.data).toBeInstanceOf(Array);
  //   const systemCheckBody = response.data[0];

  //   expect(response.status).toEqual(200);
  //   expect(systemCheckBody).toStrictEqual({
  //     brokerClientValidationMethod: 'GET',
  //     brokerClientValidationTimeoutMs: expect.any(Number),
  //     brokerClientValidationUrl: `http://localhost:${tws.port}/echo-headers/httpbin`,
  //     brokerClientValidationUrlStatusCode: 200,
  //     maskedCredentials: 'use***pwd',
  //     ok: true,
  //     testResponse: expect.any(Object),
  //   });
  // });

  // it('good validation url, basic auth, both good', async () => {
  //   bc = await createBrokerClient({
  //     brokerServerUrl: `http://localhost:${bs.port}`,
  //     brokerToken: 'broker-token-12345',
  //     type: 'client',
  //     brokerClientValidationUrl: `http://localhost:${tws.port}/echo-headers/httpbin`,
  //     brokerClientValidationBasicAuthPool: [
  //       'username:password',
  //       'username1:password1',
  //     ],
  //     filters: clientAccept,
  //   });
  //   await waitForBrokerClientConnection(bs);

  //   const response = await axiosClient.get(
  //     `http://localhost:${bc.port}/systemcheck`,
  //   );

  //   expect(response.status).toEqual(200);
  //   expect(response.data).toBeInstanceOf(Array);

  //   // first check
  //   const systemCheckBodyFirst = response.data[0];
  //   const systemCheckHeadersFirst =
  //     systemCheckBodyFirst.testResponse.body.headers;
  //   expect(systemCheckBodyFirst).toStrictEqual({
  //     brokerClientValidationMethod: 'GET',
  //     brokerClientValidationTimeoutMs: expect.any(Number),
  //     brokerClientValidationUrl: `http://localhost:${tws.port}/echo-headers/httpbin`,
  //     brokerClientValidationUrlStatusCode: 200,
  //     maskedCredentials: 'use***ord',
  //     ok: true,
  //     testResponse: expect.any(Object),
  //   });
  //   expect(systemCheckHeadersFirst['user-agent']).toBeTruthy();
  //   expect(systemCheckHeadersFirst.authorization).toEqual(
  //     `Basic ${Buffer.from('username:password').toString('base64')}`,
  //   );
  //   // second check
  //   const systemCheckBodySecond = response.data[1];
  //   const systemCheckHeadersSecond =
  //     systemCheckBodySecond.testResponse.body.headers;
  //   expect(systemCheckBodySecond).toStrictEqual({
  //     brokerClientValidationMethod: 'GET',
  //     brokerClientValidationTimeoutMs: expect.any(Number),
  //     brokerClientValidationUrl: `http://localhost:${tws.port}/echo-headers/httpbin`,
  //     brokerClientValidationUrlStatusCode: 200,
  //     maskedCredentials: 'use***rd1',
  //     ok: true,
  //     testResponse: expect.any(Object),
  //   });
  //   expect(systemCheckHeadersSecond['user-agent']).toBeTruthy();
  //   expect(systemCheckHeadersSecond.authorization).toEqual(
  //     `Basic ${Buffer.from('username1:password1').toString('base64')}`,
  //   );
  // });

  it('bad validation url', async () => {
    process.env.SNYK_BROKER_SERVER_UNIVERSAL_CONFIG_ENABLED = 'true';
    process.env.UNIVERSAL_BROKER_ENABLED = 'true';
    process.env.SERVICE_ENV = 'universaltest';
    process.env.BROKER_TOKEN_1 = 'brokertoken1';
    process.env.BROKER_TOKEN_2 = 'brokertoken2';
    process.env.BROKER_TOKEN_3 = 'brokertoken3';
    process.env.BROKER_TOKEN_4 = 'brokertoken4';
    process.env.JIRA_PAT = 'jirapat';
    process.env.JIRA_HOSTNAME = 'hostname';
    process.env.GITHUB_TOKEN = 'ghtoken';
    process.env.GITLAB_TOKEN = 'gltoken';
    process.env.AZURE_REPOS_TOKEN = '123';
    process.env.AZURE_REPOS_HOST = 'hostname';
    process.env.AZURE_REPOS_ORG = 'org';
    process.env.CLIENT_ID = 'clienid';
    process.env.CLIENT_SECRET = 'clientsecret';

    process.env.SNYK_BROKER_CLIENT_CONFIGURATION__common__default__BROKER_SERVER_URL = `http://localhost:${bs.port}`;
    process.env.SNYK_FILTER_RULES_PATHS__github = clientAccept;
    process.env.SNYK_FILTER_RULES_PATHS__gitlab = clientAccept;
    bc = await createUniversalBrokerClient();
    await waitForUniversalBrokerClientsConnection(bs, 2);

    const response = await axiosClient.get(
      `http://localhost:${bc.port}/systemcheck`,
      { timeout: 10_000 },
    );

    expect(response.data).toBeInstanceOf(Array);
    const systemCheckBody = response.data;
    expect(response.status).toEqual(500);
    expect(systemCheckBody).toMatchObject([
      {
        connectionName: 'my github connection',
        results: [
          {
            data: '/no-such-url-ever/',
            statusCode: 308,
            url: 'https://snyk.io/no-such-url-ever',
          },
        ],
        validated: false,
        message:
          'Validation failed, please review connection details for my github connection',
      },
      {
        connectionName: 'my gitlab connection',
        results: [
          {
            data: '/no-such-url-ever/',
            statusCode: 308,
            url: 'https://snyk.io/no-such-url-ever',
          },
        ],
        validated: false,
        message:
          'Validation failed, please review connection details for my gitlab connection',
      },
      {
        connectionName: 'my azure connection',
        results: [
          {
            data: '/no-such-url-ever/',
            statusCode: 308,
            url: 'https://snyk.io/no-such-url-ever',
          },
        ],
        validated: false,
        message:
          'Validation failed, please review connection details for my azure connection',
      },
      {
        connectionName: 'my jira pat',
        results: [
          {
            data: '/no-such-url-ever/',
            statusCode: 308,
            url: 'https://snyk.io/no-such-url-ever',
          },
        ],
        validated: false,
        message:
          'Validation failed, please review connection details for my jira pat',
      },
    ]);
    delete process.env.CLIENT_ID;
    delete process.env.CLIENT_SECRET;
  });

  it('invalid validation url', async () => {
    process.env.SNYK_BROKER_SERVER_UNIVERSAL_CONFIG_ENABLED = 'true';
    process.env.UNIVERSAL_BROKER_ENABLED = 'true';
    process.env.SERVICE_ENV = 'universaltest2';
    process.env.BROKER_TOKEN_1 = 'brokertoken1';
    process.env.BROKER_TOKEN_2 = 'brokertoken2';
    process.env.BROKER_TOKEN_3 = 'brokertoken3';
    process.env.BROKER_TOKEN_4 = 'brokertoken4';
    process.env.JIRA_PAT = 'jirapat';
    process.env.JIRA_HOSTNAME = 'notexists.notexists';
    process.env.GITHUB_TOKEN = 'ghtoken';
    process.env.GITLAB_TOKEN = 'gltoken';
    process.env.CLIENT_ID = 'clienid';
    process.env.CLIENT_SECRET = 'clientsecret';

    process.env.SNYK_BROKER_CLIENT_CONFIGURATION__common__default__BROKER_SERVER_URL = `http://localhost:${bs.port}`;
    process.env.SNYK_FILTER_RULES_PATHS__github = clientAccept;
    process.env.SNYK_FILTER_RULES_PATHS__gitlab = clientAccept;
    bc = await createUniversalBrokerClient();
    await waitForUniversalBrokerClientsConnection(bs, 2);

    const response = await axiosClient.get(
      `http://localhost:${bc.port}/systemcheck`,
      { timeout: 10_000 },
    );

    expect(response.data).toBeInstanceOf(Array);
    const systemCheckBody = response.data;
    expect(response.status).toEqual(500);
    expect(systemCheckBody).toMatchObject([
      {
        connectionName: 'my github connection',
        results: [
          {
            data: {
              code: 'ENOTFOUND',
              errno: -3008,
              hostname: 'notexists.notexists',
              syscall: 'getaddrinfo',
            },
            url: 'https://notexists.notexists/no-such-url-ever',
          },
        ],
        validated: false,
        message:
          'Validation failed, please review connection details for my github connection',
      },
      {
        connectionName: 'my gitlab connection',
        results: [
          {
            data: {
              code: 'ENOTFOUND',
              errno: -3008,
              hostname: 'notexists.notexists',
              syscall: 'getaddrinfo',
            },
            url: 'https://notexists.notexists/no-such-url-ever',
          },
        ],
        validated: false,
        message:
          'Validation failed, please review connection details for my gitlab connection',
      },
    ]);
    delete process.env.CLIENT_ID;
    delete process.env.CLIENT_SECRET;
  });
});
