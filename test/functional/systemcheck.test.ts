// import { resolve } from 'path';
// import * as request from 'request';
// import * as getPort from 'get-port';

// const app = require('../../lib');
// import { createTestServer } from '../utils';
// import { beforeAll } from 'jest-circus';

// describe('Broker client systemcheck endpoint', () => {
//   let echoServerPort;
//   let testServer;
//   let clientPort;
//   let clientUrl;
//   /**
//    * 1. start broker in server mode
//    * 2. start broker in client mode and join (1)
//    * 3. check /healthcheck on client and server
//    * 4. stop client and check it's on "disconnected" in the server
//    * 5. restart client with same token, make sure it's not in "disconnected"
//    */
//   beforeAll(async () => {
//     ({ echoServerPort, server: testServer } = await createTestServer());
//     console.log(echoServerPort, testServer);

//     process.env.ACCEPT = 'filters.json';

//     process.chdir(resolve(__dirname, '../fixtures/client'));
//     clientPort = await getPort();

//     clientUrl = `http://localhost:${clientPort}`;
//   });

//   it('validates a valid url for a custom endpoint', (done) => {
//     const client = app.main({
//       port: clientPort,
//       config: {
//         brokerType: 'client',
//         brokerToken: '1234567890',
//         brokerServerUrl: 'http://localhost:12345',
//         brokerClientValidationUrl: 'https://snyk.io',
//         brokerSystemcheckPath: '/custom-systemcheck',
//       },
//     });

//     request(
//       { url: `${clientUrl}/custom-systemcheck`, json: true },
//       (err, res) => {
//         expect(err).not.toBeNull();
//         expect(res.statusCode).toEqual(200);
//         expect(res.body.ok).toEqual(true);
//         expect(res.body.brokerClientValidationUrl).toEqual('https://snyk.io');

//         client.close();
//         setTimeout(() => {
//           done();
//         }, 100);
//       },
//     );
//   });

//   // t.test('good validation url, authorization header', (t) => {
//   //   const client = app.main({
//   //     port: clientPort,
//   //     config: {
//   //       brokerType: 'client',
//   //       brokerToken: '1234567890',
//   //       brokerServerUrl: 'http://localhost:12345',
//   //       brokerClientValidationUrl: 'https://httpbin.org/headers',
//   //       brokerClientValidationAuthorizationHeader:
//   //         'token my-special-access-token',
//   //     },
//   //   });

//   //   request({ url: `${clientUrl}/systemcheck`, json: true }, (err, res) => {
//   //     if (err) {
//   //       return t.threw(err);
//   //     }

//   //     t.equal(res.statusCode, 200, '200 statusCode');
//   //     t.equal(res.body.ok, true, '{ ok: true } in body');
//   //     t.equal(
//   //       res.body.brokerClientValidationUrl,
//   //       'https://httpbin.org/headers',
//   //       'validation url present',
//   //     );
//   //     t.ok(
//   //       res.body.testResponse.body.headers['User-Agent'],
//   //       'user-agent header is present in validation request',
//   //     );
//   //     t.equal(
//   //       res.body.testResponse.body.headers.Authorization,
//   //       'token my-special-access-token',
//   //       'proper authorization header in validation request',
//   //     );

//   //     client.close();
//   //     setTimeout(() => {
//   //       t.end();
//   //     }, 100);
//   //   });
//   // });

//   // t.test('good validation url, basic auth', (t) => {
//   //   const client = app.main({
//   //     port: clientPort,
//   //     config: {
//   //       brokerType: 'client',
//   //       brokerToken: '1234567890',
//   //       brokerServerUrl: 'http://localhost:12345',
//   //       brokerClientValidationUrl: 'https://httpbin.org/headers',
//   //       brokerClientValidationBasicAuth: 'username:password',
//   //     },
//   //   });

//   //   request({ url: `${clientUrl}/systemcheck`, json: true }, (err, res) => {
//   //     if (err) {
//   //       return t.threw(err);
//   //     }

//   //     t.equal(res.statusCode, 200, '200 statusCode');
//   //     t.equal(res.body.ok, true, '{ ok: true } in body');
//   //     t.equal(
//   //       res.body.brokerClientValidationUrl,
//   //       'https://httpbin.org/headers',
//   //       'validation url present',
//   //     );
//   //     t.ok(
//   //       res.body.testResponse.body.headers['User-Agent'],
//   //       'user-agent header is present in validation request',
//   //     );
//   //     const expectedAuthHeader = `Basic ${Buffer.from(
//   //       'username:password',
//   //     ).toString('base64')}`;
//   //     t.equal(
//   //       res.body.testResponse.body.headers.Authorization,
//   //       expectedAuthHeader,
//   //       'proper authorization header in request',
//   //     );

//   //     client.close();
//   //     setTimeout(() => {
//   //       t.end();
//   //     }, 100);
//   //   });
//   // });

//   // t.test('bad validation url', (t) => {
//   //   const client = app.main({
//   //     port: clientPort,
//   //     config: {
//   //       brokerType: 'client',
//   //       brokerToken: '1234567890',
//   //       brokerServerUrl: 'http://localhost:12345',
//   //       brokerClientValidationUrl: 'https://snyk.io/no-such-url-ever',
//   //     },
//   //   });

//   //   request({ url: `${clientUrl}/systemcheck`, json: true }, (err, res) => {
//   //     if (err) {
//   //       return t.threw(err);
//   //     }

//   //     t.equal(res.statusCode, 500, '500 statusCode');
//   //     t.equal(res.body.ok, false, '{ ok: false } in body');
//   //     t.equal(
//   //       res.body.brokerClientValidationUrl,
//   //       'https://snyk.io/no-such-url-ever',
//   //       'validation url present',
//   //     );

//   //     client.close();
//   //     setTimeout(() => {
//   //       t.end();
//   //     }, 100);
//   //   });
//   // });
// });
