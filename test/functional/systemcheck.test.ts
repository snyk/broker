// const test = require('tap-only');
// const path = require('path');
// const request = require('request');
// const app = require('../../lib');
// const root = __dirname;
//
// const { port, createTestServer } = require('../utils');

describe('broker client systemcheck endpoint', () => {
  it.skip('good validation url, custom endpoint, no authorization', async () => {});
});

// test('broker client systemcheck endpoint', (t) => {
//   /**
//    * 1. start broker in server mode
//    * 2. start broker in client mode and join (1)
//    * 3. check /healthcheck on client and server
//    * 4. stop client and check it's on "disconnected" in the server
//    * 5. restart client with same token, make sure it's not in "disconnected"
//    */
//
//   const { testServer } = createTestServer();
//
//   t.teardown(() => {
//     testServer.close();
//   });
//
//   process.env.ACCEPT = 'filters.json';
//
//   process.chdir(path.resolve(root, '../fixtures/client'));
//   const clientPort = port();
//
//   t.plan(9);
//
//   const clientUrl = `http://localhost:${clientPort}`;
//
//   t.test('good validation url, custom endpoint, no authorization', (t) => {
//     const client = app.main({
//       port: clientPort,
//       config: {
//         brokerType: 'client',
//         brokerToken: '1234567890',
//         brokerServerUrl: 'http://localhost:12345',
//         brokerClientValidationUrl: 'https://httpbin.org/headers',
//         brokerSystemcheckPath: '/custom-systemcheck',
//       },
//     });
//
//     request(
//       { url: `${clientUrl}/custom-systemcheck`, json: true },
//       (err, res) => {
//         if (err) {
//           return t.threw(err);
//         }
//
//         t.equal(res.statusCode, 200, '200 statusCode');
//         t.equal(res.body[0].ok, true, '[{ ok: true }] in body');
//         t.equal(
//           res.body[0].maskedCredentials,
//           null,
//           '[{ maskedCredentials: null }] in body',
//         );
//         t.equal(
//           res.body[0].brokerClientValidationUrl,
//           'https://httpbin.org/headers',
//           'validation url present',
//         );
//         t.equal(
//           res.body[0].testResponse.body.headers.Authorization,
//           undefined,
//           'does not have authorization header',
//         );
//
//         client.close();
//         setTimeout(() => {
//           t.end();
//         }, 100);
//       },
//     );
//   });
//
//   t.test('good validation url, authorization header', (t) => {
//     const client = app.main({
//       port: clientPort,
//       config: {
//         brokerType: 'client',
//         brokerToken: '1234567890',
//         brokerServerUrl: 'http://localhost:12345',
//         brokerClientValidationUrl: 'https://httpbin.org/headers',
//         brokerClientValidationAuthorizationHeader:
//           'token my-special-access-token',
//       },
//     });
//
//     request({ url: `${clientUrl}/systemcheck`, json: true }, (err, res) => {
//       if (err) {
//         return t.threw(err);
//       }
//
//       t.equal(res.statusCode, 200, '200 statusCode');
//       t.equal(res.body[0].ok, true, '[{ ok: true }] in body');
//       t.equal(
//         res.body[0].brokerClientValidationUrl,
//         'https://httpbin.org/headers',
//         'validation url present',
//       );
//       t.ok(
//         res.body[0].testResponse.body.headers['User-Agent'],
//         'user-agent header is present in validation request',
//       );
//       t.equal(
//         res.body[0].testResponse.body.headers.Authorization,
//         'token my-special-access-token',
//         'proper authorization header in validation request',
//       );
//
//       client.close();
//       setTimeout(() => {
//         t.end();
//       }, 100);
//     });
//   });
//
//   t.test('good validation url, basic auth', (t) => {
//     const client = app.main({
//       port: clientPort,
//       config: {
//         brokerType: 'client',
//         brokerToken: '1234567890',
//         brokerServerUrl: 'http://localhost:12345',
//         brokerClientValidationUrl: 'https://httpbin.org/headers',
//         brokerClientValidationBasicAuth: 'username:password',
//       },
//     });
//
//     request({ url: `${clientUrl}/systemcheck`, json: true }, (err, res) => {
//       if (err) {
//         return t.threw(err);
//       }
//
//       t.equal(res.statusCode, 200, '200 statusCode');
//       t.equal(res.body[0].ok, true, '[{ ok: true }] in body');
//       t.equal(
//         res.body[0].brokerClientValidationUrl,
//         'https://httpbin.org/headers',
//         'validation url present',
//       );
//       t.equal(
//         res.body[0].maskedCredentials,
//         'use***ord',
//         'masked credentials present',
//       );
//       t.ok(
//         res.body[0].testResponse.body.headers['User-Agent'],
//         'user-agent header is present in validation request',
//       );
//       const expectedAuthHeader = `Basic ${Buffer.from(
//         'username:password',
//       ).toString('base64')}`;
//       t.equal(
//         res.body[0].testResponse.body.headers.Authorization,
//         expectedAuthHeader,
//         'proper authorization header in request',
//       );
//
//       client.close();
//       setTimeout(() => {
//         t.end();
//       }, 100);
//     });
//   });
//
//   t.test('good validation url, header auth', (t) => {
//     const client = app.main({
//       port: clientPort,
//       config: {
//         brokerType: 'client',
//         brokerToken: '1234567890',
//         brokerServerUrl: 'http://localhost:12345',
//         brokerClientValidationUrl: 'https://httpbin.org/headers',
//         brokerClientValidationAuthorizationHeader: 'token magical_header_123',
//       },
//     });
//
//     request({ url: `${clientUrl}/systemcheck`, json: true }, (err, res) => {
//       if (err) {
//         return t.threw(err);
//       }
//
//       t.equal(res.statusCode, 200, '200 statusCode');
//       t.equal(res.body[0].ok, true, '[{ ok: true }] in body');
//       t.equal(
//         res.body[0].brokerClientValidationUrl,
//         'https://httpbin.org/headers',
//         'validation url present',
//       );
//       t.equal(
//         res.body[0].maskedCredentials,
//         'mag***123',
//         'masked credentials present',
//       );
//       t.ok(
//         res.body[0].testResponse.body.headers['User-Agent'],
//         'user-agent header is present in validation request',
//       );
//       t.equal(
//         res.body[0].testResponse.body.headers.Authorization,
//         'token magical_header_123',
//         'proper authorization header in request',
//       );
//
//       client.close();
//       setTimeout(() => {
//         t.end();
//       }, 100);
//     });
//   });
//
//   t.test('good validation url, header auth lacking spaces', (t) => {
//     const client = app.main({
//       port: clientPort,
//       config: {
//         brokerType: 'client',
//         brokerToken: '1234567890',
//         brokerServerUrl: 'http://localhost:12345',
//         brokerClientValidationUrl: 'https://httpbin.org/headers',
//         brokerClientValidationAuthorizationHeader: 'tokenmagical_header_123',
//       },
//     });
//
//     request({ url: `${clientUrl}/systemcheck`, json: true }, (err, res) => {
//       if (err) {
//         return t.threw(err);
//       }
//
//       t.equal(res.statusCode, 200, '200 statusCode');
//       t.equal(res.body[0].ok, true, '[{ ok: true }] in body');
//       t.equal(
//         res.body[0].brokerClientValidationUrl,
//         'https://httpbin.org/headers',
//         'validation url present',
//       );
//       t.equal(
//         res.body[0].maskedCredentials,
//         'tok***123',
//         'masked credentials present',
//       );
//       t.equal(
//         res.body[0].testResponse.body.headers.Authorization,
//         'tokenmagical_header_123',
//         'proper authorization header in request',
//       );
//
//       client.close();
//       setTimeout(() => {
//         t.end();
//       }, 100);
//     });
//   });
//
//   t.test('good validation url, basic auth, short creds', (t) => {
//     const client = app.main({
//       port: clientPort,
//       config: {
//         brokerType: 'client',
//         brokerToken: '1234567890',
//         brokerServerUrl: 'http://localhost:12345',
//         brokerClientValidationUrl: 'https://httpbin.org/headers',
//         brokerClientValidationBasicAuth: 'use:pw',
//       },
//     });
//
//     request({ url: `${clientUrl}/systemcheck`, json: true }, (err, res) => {
//       if (err) {
//         return t.threw(err);
//       }
//
//       t.equal(res.statusCode, 200, '200 statusCode');
//       t.equal(
//         res.body[0].maskedCredentials,
//         '***',
//         'masked credentials present',
//       );
//
//       client.close();
//       setTimeout(() => {
//         t.end();
//       }, 100);
//     });
//   });
//
//   t.test('good validation url, basic auth, 7 char creds', (t) => {
//     const client = app.main({
//       port: clientPort,
//       config: {
//         brokerType: 'client',
//         brokerToken: '1234567890',
//         brokerServerUrl: 'http://localhost:12345',
//         brokerClientValidationUrl: 'https://httpbin.org/headers',
//         brokerClientValidationBasicAuth: 'use:pwd',
//       },
//     });
//
//     request({ url: `${clientUrl}/systemcheck`, json: true }, (err, res) => {
//       if (err) {
//         return t.threw(err);
//       }
//
//       t.equal(res.statusCode, 200, '200 statusCode');
//       t.equal(
//         res.body[0].maskedCredentials,
//         'use***pwd',
//         'masked credentials present',
//       );
//
//       client.close();
//       setTimeout(() => {
//         t.end();
//       }, 100);
//     });
//   });
//
//   t.test('good validation url, basic auth, both good', (t) => {
//     const client = app.main({
//       port: clientPort,
//       config: {
//         brokerType: 'client',
//         brokerToken: '1234567890',
//         brokerServerUrl: 'http://localhost:12345',
//         brokerClientValidationUrl: 'https://httpbin.org/headers',
//         brokerClientValidationBasicAuthPool: [
//           'username:password',
//           'username1:password1',
//         ],
//       },
//     });
//
//     request({ url: `${clientUrl}/systemcheck`, json: true }, (err, res) => {
//       if (err) {
//         return t.threw(err);
//       }
//
//       t.equal(res.statusCode, 200, '200 statusCode');
//       t.equal(res.body[0].ok, true, '[{ ok: true }, ...] in body');
//       t.equal(res.body[1].ok, true, '[..., { ok: true }] in body');
//       t.equal(
//         res.body[0].brokerClientValidationUrl,
//         'https://httpbin.org/headers',
//         'validation url present [0]',
//       );
//       t.equal(
//         res.body[1].brokerClientValidationUrl,
//         'https://httpbin.org/headers',
//         'validation url present [1]',
//       );
//       t.ok(
//         res.body[0].testResponse.body.headers['User-Agent'],
//         'user-agent header is present in validation request [0]',
//       );
//       t.ok(
//         res.body[1].testResponse.body.headers['User-Agent'],
//         'user-agent header is present in validation request [1]',
//       );
//       t.equal(
//         res.body[0].maskedCredentials,
//         'use***ord',
//         'masked credentials present in validation request [0]',
//       );
//       t.equal(
//         res.body[1].maskedCredentials,
//         'use***rd1',
//         'masked credentials present in validation request [1]',
//       );
//       t.equal(
//         res.body[0].testResponse.body.headers.Authorization,
//         `Basic ${Buffer.from('username:password').toString('base64')}`,
//         'proper authorization header in request [0]',
//       );
//       t.equal(
//         res.body[1].testResponse.body.headers.Authorization,
//         `Basic ${Buffer.from('username1:password1').toString('base64')}`,
//         'proper authorization header in request [1]',
//       );
//
//       client.close();
//       setTimeout(() => {
//         t.end();
//       }, 100);
//     });
//   });
//
//   t.test('bad validation url', (t) => {
//     const client = app.main({
//       port: clientPort,
//       config: {
//         brokerType: 'client',
//         brokerToken: '1234567890',
//         brokerServerUrl: 'http://localhost:12345',
//         brokerClientValidationUrl: 'https://snyk.io/no-such-url-ever',
//       },
//     });
//
//     request({ url: `${clientUrl}/systemcheck`, json: true }, (err, res) => {
//       if (err) {
//         return t.threw(err);
//       }
//
//       t.equal(res.statusCode, 500, '500 statusCode');
//       t.equal(res.body[0].ok, false, '[{ ok: false }] in body');
//       t.equal(
//         res.body[0].brokerClientValidationUrl,
//         'https://snyk.io/no-such-url-ever',
//         'validation url present',
//       );
//
//       client.close();
//       setTimeout(() => {
//         t.end();
//       }, 100);
//     });
//   });
// });
