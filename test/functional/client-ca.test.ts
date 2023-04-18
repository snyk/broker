// const t = require('tap');
// const path = require('path');
// const app = require('../../lib');
// const { createTestServer, port, requestAsync } = require('../utils');
// const root = __dirname;
//
// process.env.TEST_KEY = path.resolve(
//   root,
//   '../fixtures/certs/server/privkey.pem',
// );
// process.env.TEST_CERT = path.resolve(
//   root,
//   '../fixtures/certs/server/fullchain.pem',
// );

describe('correctly use supplied CA cert on client for connections', () => {
  it.skip('get an error trying to connect to a server with unknown CA', async () => {});
});

// t.test(
//   'correctly use supplied CA cert on client for connections',
//   async (t) => {
//     /**
//      * 1. start broker in server mode
//      * 2. start broker in client mode
//      * 3. run local https server with _self-signed_ cert that replicates "private server"
//      * 4. send request to the server and expect error
//      * 5. start broker in client mode with supplied CA cert
//      * 6. send request to the server and expect success
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
//     let clientPort;
//     const serverPort = port();
//     const server = await app.main({ port: serverPort });
//
//     process.chdir(path.resolve(root, '../fixtures/client'));
//     process.env.BROKER_TYPE = 'client';
//     process.env.BROKER_TOKEN = '12345';
//     process.env.BROKER_SERVER_URL = `http://localhost:${serverPort}`;
//     process.env.ORIGIN_PORT = echoServerPort;
//     process.env.ACCEPT = 'filters-https.json'; // We need to connect to the https version of _internal service_
//     let client = await app.main({ port: port() });
//
//     // wait for the client to successfully connect to the server and identify itself
//     const promise = new Promise((resolve) => {
//       server.io.once('connection', async (socket) => {
//         socket.on('identify', async (clientData) => {
//           const token = clientData.token;
//
//           await t.test(
//             'get an error trying to connect to a server with unknown CA',
//             async (t) => {
//               const url = `http://localhost:${serverPort}/broker/${token}/echo-body`;
//               let { res } = await requestAsync({
//                 url,
//                 method: 'post',
//                 json: true,
//               });
//               t.equal(res.statusCode, 500, '500 statusCode');
//             },
//           );
//
//           await t.test('close', async (t) => {
//             client.close();
//             t.ok('client closed');
//           });
//
//           // const p = new Promise((resolve) => {
//           // await t.test('launch a new client with CA set', async (t) => {
//           //     server.io.on('connection', async (socket) => {
//           //       socket.once('identify', t.end);
//           //     });
//           //
//           //     // Specify CA file
//           //     process.env.CA_CERT = '../certs/ca/my-root-ca.crt.pem';
//           //     process.env.BROKER_CLIENT_VALIDATION_URL = `https://localhost:${echoServerPort}/test`;
//           //     clientPort = port();
//           //     client = await app.main({ port: clientPort });
//           //   })
//           // });
//
//           // await t.test('successfully broker POST with CA set', async (t) => {
//           //   const url = `http://localhost:${serverPort}/broker/${token}/echo-body`;
//           //   let { res } = await requestAsync({
//           //     url,
//           //     method: 'post',
//           //     json: true,
//           //   });
//           //   t.equal(res.statusCode, 200, '200 statusCode');
//           // });
//           //
//           // await t.test(
//           //   'successfully call systemcheck with CA set',
//           //   async (t) => {
//           //     const url = `http://localhost:${clientPort}/systemcheck`;
//           //     let { res } = await requestAsync({ url, json: true });
//           //     t.equal(res.statusCode, 200, '200 statusCode');
//           //   },
//           // );
//
//           t.test('clean up', async (t) => {
//             //await client.close();
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
