// const t = require('tap');
// const path = require('path');
// const request = require('request');
// const app = require('../../lib');
// const { port, createTestServer } = require('../utils');
// const root = __dirname;

describe('proxy requests originating from behind the broker client', () => {
  it.skip('server identifies self to client', async () => {});
});

// t.test(
//   'proxy requests originating from behind the broker client',
//   async (t) => {
//     /**
//      * 1. start broker in server mode
//      * 2. start broker in client mode and join (1)
//      * 3. run local http server that replicates "private server"
//      * 4. send requests to **client**
//      *
//      * Note: server is forwarding requests to echo-server defined in test/util.js
//      */
//
//     const { echoServerPort, testServer } = createTestServer();
//
//     t.teardown(() => {
//       testServer.close();
//     });
//
//     process.env.ACCEPT = 'filters.json';
//
//     process.chdir(path.resolve(root, '../fixtures/server'));
//     process.env.BROKER_TYPE = 'server';
//     process.env.ORIGIN_PORT = echoServerPort;
//     const serverPort = port();
//     const server = await app.main({ port: serverPort });
//
//     process.chdir(path.resolve(root, '../fixtures/client'));
//     process.env.BROKER_TYPE = 'client';
//     process.env.BROKER_TOKEN = 'C481349B-4014-43D9-B59D-BA41E1315001'; // uuid.v4
//     process.env.BROKER_SERVER_URL = `http://localhost:${serverPort}`;
//     const clientPort = port();
//     const client = await app.main({ port: clientPort });
//
//     t.plan(17);
//
//     client.io.once('identify', (serverData) => {
//       t.test('server identifies self to client', (t) => {
//         t.same(
//           serverData,
//           { capabilities: ['receive-post-streams'] },
//           'server advertises capabilities',
//         );
//         t.end();
//       });
//     });
//
//     // wait for the client to successfully connect to the server and identify itself
//     server.io.once('connection', (socket) => {
//       socket.once('identify', (clientData) => {
//         t.test('successfully broker POST', (t) => {
//           const url = `http://localhost:${clientPort}/echo-body`;
//           const body = { some: { example: 'json' } };
//           request({ url, method: 'post', json: true, body }, (err, res) => {
//             t.equal(res.statusCode, 200, '200 statusCode');
//             t.same(res.body, body, 'body brokered');
//             t.end();
//           });
//         });
//
//         t.test('successfully broker exact bytes of POST body', (t) => {
//           const url = `http://localhost:${clientPort}/echo-body`;
//           // stringify the JSON unusually to ensure an unusual exact body
//           const body = Buffer.from(
//             JSON.stringify({ some: { example: 'json' } }, null, 5),
//           );
//           const headers = { 'Content-Type': 'application/json' };
//           request({ url, method: 'post', headers, body }, (err, res) => {
//             const responseBody = Buffer.from(res.body);
//             t.equal(res.statusCode, 200, '200 statusCode');
//             t.same(responseBody, body, 'body brokered exactly');
//             t.end();
//           });
//         });
//
//         t.test('successfully broker GET', (t) => {
//           const url = `http://localhost:${clientPort}/echo-param/xyz`;
//           request({ url, method: 'get' }, (err, res) => {
//             t.equal(res.statusCode, 200, '200 statusCode');
//             t.equal(res.body, 'xyz', 'body brokered');
//             t.end();
//           });
//         });
//
//         // the filtering happens in the broker client
//         t.test('block request for non-whitelisted url', (t) => {
//           const url = `http://localhost:${clientPort}/not-allowed`;
//           request({ url, method: 'post', json: true }, (err, res, body) => {
//             t.equal(res.statusCode, 401, '401 statusCode');
//             t.equal(body.message, 'blocked', '"blocked" body: ' + body);
//             t.equal(
//               body.reason,
//               'Request does not match any accept rule, blocking HTTP request',
//               'Block message',
//             );
//             t.equal(body.url, '/not-allowed', 'Blocked url');
//             t.end();
//           });
//         });
//
//         // the filtering happens in the broker client
//         t.test('allow request for valid url with valid body', (t) => {
//           const url = `http://localhost:${clientPort}/echo-body/filtered`;
//           const body = { proxy: { me: 'please' } };
//           request({ url, method: 'post', json: true, body }, (err, res) => {
//             t.equal(res.statusCode, 200, '200 statusCode');
//             t.same(res.body, body, 'body brokered');
//             t.end();
//           });
//         });
//
//         // the filtering happens in the broker client
//         t.test('block request for valid url with invalid body', (t) => {
//           const url = `http://localhost:${clientPort}/echo-body/filtered`;
//           const body = { proxy: { me: 'now!' } };
//           request(
//             { url, method: 'post', json: true, body },
//             (err, res, body) => {
//               t.equal(res.statusCode, 401, '401 statusCode');
//               t.equal(body.message, 'blocked', '"blocked" body: ' + body);
//               t.end();
//             },
//           );
//         });
//
//         // the filtering happens in the broker client
//         t.test('allow request for valid url with valid query param', (t) => {
//           const url = `http://localhost:${clientPort}/echo-query/filtered`;
//           const qs = { proxyMe: 'please' };
//           request({ url, method: 'get', json: true, qs }, (err, res) => {
//             t.equal(res.statusCode, 200, '200 statusCode');
//             t.same(res.body, qs, 'querystring brokered');
//             t.end();
//           });
//         });
//
//         // the filtering happens in the broker client
//         t.test('block request for valid url with invalid query param', (t) => {
//           const url = `http://localhost:${clientPort}/echo-query/filtered`;
//           const qs = { proxyMe: 'now!' };
//           request({ url, method: 'get', qs }, (err, res) => {
//             t.equal(res.statusCode, 401, '401 statusCode');
//             t.end();
//           });
//         });
//
//         // the filtering happens in the broker client
//         t.test('block request for valid url with missing query param', (t) => {
//           const url = `http://localhost:${clientPort}/echo-query/filtered`;
//           request({ url, method: 'get' }, (err, res) => {
//             t.equal(res.statusCode, 401, '401 statusCode');
//             t.end();
//           });
//         });
//
//         // the filtering happens in the broker server
//         t.test(
//           'block request for valid URL which is not allowed on server',
//           (t) => {
//             const url = `http://localhost:${clientPort}/server-side-blocked`;
//             request({ url, method: 'get' }, (err, res) => {
//               t.equal(res.statusCode, 401, '401 statusCode');
//               t.end();
//             });
//           },
//         );
//
//         // the filtering happens in the broker server - this indicates a very badly misconfigured client
//         t.test(
//           'block request for valid URL which is not allowed on server with streaming response',
//           (t) => {
//             const url = `http://localhost:${clientPort}/server-side-blocked-streaming`;
//             request({ url, method: 'get' }, (err, res) => {
//               t.equal(res.statusCode, 401, '401 statusCode');
//               t.end();
//             });
//           },
//         );
//
//         t.test('allow request for valid url with valid accept header', (t) => {
//           const url = `http://localhost:${clientPort}/echo-param-protected/xyz`;
//           request(
//             {
//               url,
//               method: 'get',
//               headers: {
//                 ACCEPT: 'valid.accept.header',
//                 accept: 'valid.accept.header',
//               },
//             },
//             (err, res) => {
//               t.equal(res.statusCode, 200, '200 statusCode');
//               t.equal(res.body, 'xyz', 'body brokered');
//               t.end();
//             },
//           );
//         });
//
//         t.test(
//           'block request for valid url with invalid accept header',
//           (t) => {
//             const invalidAcceptHeader = 'invalid.accept.header';
//             const url = `http://localhost:${clientPort}/echo-param-protected/xyz`;
//             request(
//               {
//                 url,
//                 method: 'get',
//                 headers: {
//                   ACCEPT: invalidAcceptHeader,
//                   accept: invalidAcceptHeader,
//                 },
//               },
//               (err, res) => {
//                 t.equal(res.statusCode, 401, '401 statusCode');
//                 t.end();
//               },
//             );
//           },
//         );
//
//         // this validates that the broker *server* sends to the correct broker token
//         // header to the echo-server
//         t.test(
//           'broker ID is included in headers from server to private',
//           (t) => {
//             const url = `http://localhost:${clientPort}/echo-headers`;
//             request({ url, method: 'post' }, (err, res) => {
//               const responseBody = JSON.parse(res.body);
//               t.equal(res.statusCode, 200, '200 statusCode');
//               t.equal(
//                 responseBody['x-broker-token'],
//                 clientData.token.toLowerCase(),
//                 'X-Broker-Token header present and lowercased',
//               );
//               t.end();
//             });
//           },
//         );
//
//         t.test('querystring parameters are brokered', (t) => {
//           const url = `http://localhost:${clientPort}/echo-query?shape=square&colour=yellow`;
//           request({ url, method: 'get' }, (err, res) => {
//             const responseBody = JSON.parse(res.body);
//             t.equal(res.statusCode, 200, '200 statusCode');
//             t.same(
//               responseBody,
//               { shape: 'square', colour: 'yellow' },
//               'querystring brokered',
//             );
//             t.end();
//           });
//         });
//
//         t.test('clean up', (t) => {
//           client.close();
//           setTimeout(() => {
//             server.close();
//             t.ok('sockets closed');
//             t.end();
//           }, 100);
//         });
//       });
//     });
//   },
// );
