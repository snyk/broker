// const t = require('tap');
// const path = require('path');
// const app = require('../../lib');
// const { createTestServer, port, requestAsync } = require('../utils');
// const root = __dirname;

describe('correctly handle pool of multiple clients with same BROKER_TOKEN', () => {
  it.skip('successfully broker POST with 1st connected client', async () => {});
});

// t.test(
//   'correctly handle pool of multiple clients with same BROKER_TOKEN',
//   async (t) => {
//     /**
//      * 1. start broker in server mode
//      * 2. start broker in client mode and join
//      * 3. run local http server that replicates "private server"
//      * 4. send request to the server
//      * 5. start a 2nd broker in client mode and join (2nd client becomes primary)
//      * 6. send request to the server
//      * 7. disconnect 1st client
//      * 8. connection through server should still work through 2nd client
//      *
//      */
//
//     const { echoServerPort, testServer } = createTestServer();
//
//     t.teardown(async () => {
//       testServer.close();
//     });
//
//     process.env.ACCEPT = 'filters.json';
//
//     process.chdir(path.resolve(root, '../fixtures/server'));
//     process.env.BROKER_TYPE = 'server';
//     const serverPort = port();
//     const server = await app.main({ port: serverPort });
//
//     process.chdir(path.resolve(root, '../fixtures/client'));
//     process.env.BROKER_TYPE = 'client';
//     process.env.BROKER_TOKEN = '12345';
//     process.env.BROKER_SERVER_URL = `http://localhost:${serverPort}`;
//     process.env.ORIGIN_PORT = echoServerPort;
//     const client = await app.main({ port: port() });
//
//     //let secondClient = {};
//
//     // wait for the client to successfully connect to the server and identify itself
//     const promise = new Promise((resolve) => {
//       server.io.once('connection', async (socket) => {
//         socket.on('identify', async (clientData) => {
//           const token = clientData.token;
//
//           await t.test(
//             'successfully broker POST with 1st connected client',
//             async (t) => {
//               const url = `http://localhost:${serverPort}/broker/${token}/echo-body`;
//               const { res } = await requestAsync({
//                 url,
//                 method: 'post',
//                 json: true,
//               });
//               t.equal(res.statusCode, 200, '200 statusCode');
//             },
//           );
//
//           // t.test('launch a 2nd client', (t) => {
//           //   server.io.on('connection', (socket) => {
//           //     socket.once('identify', () => {
//           //       t.ok('2nd client connected');
//           //       t.end();
//           //     });
//           //   });
//           //
//           //   secondClient = app.main({ port: port() - 1 }); // Run it on a different port
//           // });
//           //
//           // t.test('successfully broker POST with 2nd client', (t) => {
//           //   const url = `http://localhost:${serverPort}/broker/${token}/echo-body`;
//           //   request({ url, method: 'post', json: true }, (err, res) => {
//           //     t.equal(res.statusCode, 200, '200 statusCode');
//           //     t.end();
//           //   });
//           // });
//           //
//
//           await t.test('close 1st client', async (t) => {
//             client.close();
//             t.ok('1st client closed');
//           });
//           //
//           // t.test('successfully broker POST with 2nd client', (t) => {
//           //   const url = `http://localhost:${serverPort}/broker/${token}/echo-body`;
//           //   request({ url, method: 'post', json: true }, (err, res) => {
//           //     t.equal(res.statusCode, 200, '200 statusCode');
//           //     t.end();
//           //   });
//           // });
//
//           t.test('clean up', async (t) => {
//             //secondClient.close();
//             setTimeout(() => {
//               server.close();
//               t.ok('sockets closed');
//               t.end();
//               resolve();
//             }, 100);
//           });
//         });
//       });
//     });
//     await promise;
//   },
// );
