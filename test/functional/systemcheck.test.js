const test = require('tap-only');
const path = require('path');
const request = require('request');
const app = require('../../lib');
const root = __dirname;

const { port, createTestServer } = require('../utils');

test('broker client systemcheck endpoint', (t) => {
  /**
   * 1. start broker in server mode
   * 2. start broker in client mode and join (1)
   * 3. check /healthcheck on client and server
   * 4. stop client and check it's on "disconnected" in the server
   * 5. restart client with same token, make sure it's not in "disconnected"
   */

  const { testServer } = createTestServer();

  t.teardown(() => {
    testServer.close();
  });

  process.env.ACCEPT = 'filters.json';

  process.chdir(path.resolve(root, '../fixtures/client'));
  const clientPort = port();

  t.plan(5);

  const clientUrl = `http://localhost:${clientPort}`;

  t.test('good validation url, custom endpoint', (t) => {
    const client = app.main({
      port: clientPort,
      config: {
        brokerType: 'client',
        brokerToken: '1234567890',
        brokerServerUrl: 'http://localhost:12345',
        brokerClientValidationUrl: 'https://snyk.io',
        brokerSystemcheckPath: '/custom-systemcheck',
      },
    });

    request(
      { url: `${clientUrl}/custom-systemcheck`, json: true },
      (err, res) => {
        if (err) {
          return t.threw(err);
        }

        t.equal(res.statusCode, 200, '200 statusCode');
        t.equal(res.body.ok, true, '{ ok: true } in body');
        t.equal(
          res.body.brokerClientValidationUrl,
          'https://snyk.io',
          'validation url present',
        );

        client.close();
        setTimeout(() => {
          t.end();
        }, 100);
      },
    );
  });

  t.test('good validation url, authorization header', (t) => {
    const client = app.main({
      port: clientPort,
      config: {
        brokerType: 'client',
        brokerToken: '1234567890',
        brokerServerUrl: 'http://localhost:12345',
        brokerClientValidationUrl: 'https://httpbin.org/headers',
        brokerClientValidationAuthorizationHeader:
          'token my-special-access-token',
      },
    });

    request({ url: `${clientUrl}/systemcheck`, json: true }, (err, res) => {
      if (err) {
        return t.threw(err);
      }

      t.equal(res.statusCode, 200, '200 statusCode');
      t.equal(res.body.ok, true, '{ ok: true } in body');
      t.equal(
        res.body.brokerClientValidationUrl,
        'https://httpbin.org/headers',
        'validation url present',
      );
      t.ok(
        res.body.testResponse.body.headers['User-Agent'],
        'user-agent header is present in validation request',
      );
      t.equal(
        res.body.testResponse.body.headers.Authorization,
        'token my-special-access-token',
        'proper authorization header in validation request',
      );

      client.close();
      setTimeout(() => {
        t.end();
      }, 100);
    });
  });

  t.test('good validation url, basic auth', (t) => {
    const client = app.main({
      port: clientPort,
      config: {
        brokerType: 'client',
        brokerToken: '1234567890',
        brokerServerUrl: 'http://localhost:12345',
        brokerClientValidationUrl: 'https://httpbin.org/headers',
        brokerClientValidationBasicAuth: 'username:password',
      },
    });

    request({ url: `${clientUrl}/systemcheck`, json: true }, (err, res) => {
      if (err) {
        return t.threw(err);
      }

      t.equal(res.statusCode, 200, '200 statusCode');
      t.equal(res.body.ok, true, '{ ok: true } in body');
      t.equal(
        res.body.brokerClientValidationUrl,
        'https://httpbin.org/headers',
        'validation url present',
      );
      t.ok(
        res.body.testResponse.body.headers['User-Agent'],
        'user-agent header is present in validation request',
      );
      const expectedAuthHeader = `Basic ${Buffer.from(
        'username:password',
      ).toString('base64')}`;
      t.equal(
        res.body.testResponse.body.headers.Authorization,
        expectedAuthHeader,
        'proper authorization header in request',
      );

      client.close();
      setTimeout(() => {
        t.end();
      }, 100);
    });
  });

  t.test('bad validation url', (t) => {
    const client = app.main({
      port: clientPort,
      config: {
        brokerType: 'client',
        brokerToken: '1234567890',
        brokerServerUrl: 'http://localhost:12345',
        brokerClientValidationUrl: 'https://snyk.io/no-such-url-ever',
      },
    });

    request({ url: `${clientUrl}/systemcheck`, json: true }, (err, res) => {
      if (err) {
        return t.threw(err);
      }

      t.equal(res.statusCode, 500, '500 statusCode');
      t.equal(res.body.ok, false, '{ ok: false } in body');
      t.equal(
        res.body.brokerClientValidationUrl,
        'https://snyk.io/no-such-url-ever',
        'validation url present',
      );

      client.close();
      setTimeout(() => {
        t.end();
      }, 100);
    });
  });

  t.test('container flow', (t) => {
    const client = app.main({
      port: clientPort,
      config: {
        brokerType: 'client',
        brokerToken: '1234567890',
        brokerServerUrl: 'http://localhost:12345',
        crCredentials: 'topSecret',
        crAgentUrl: 'https://httpbin.org/anything',
      },
    });

    request({ url: `${clientUrl}/systemcheck`, json: true }, (err, res) => {
      if (err) {
        return t.threw(err);
      }

      t.equal(res.statusCode, 200, '200 statusCode');
      t.equal(res.body.ok, true, '{ ok: true } in body');
      t.ok(
        res.body.testResponse.body.headers['User-Agent'],
        'user-agent header is present in validation request',
      );
      t.equal(
        res.body.testResponse.body.headers['X-Systemcheck-Credentials'],
        'topSecret',
        'credentials header is present',
      );

      client.close();
      setTimeout(() => {
        t.end();
      }, 100);
    });
  });
});
