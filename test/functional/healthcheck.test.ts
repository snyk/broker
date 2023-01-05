import { createUtilServer, UtilServer } from '../utils';
import axios from 'axios';

const app = require('../../lib');
const version = require('../../lib/version');
const path = require('path');
const fixtures = path.resolve(__dirname, '..', 'fixtures');
const serverAccept = path.join(fixtures, 'server', 'filters.json');
const clientAccept = path.join(fixtures, 'client', 'filters.json');

describe('proxy requests originating from behind the broker client', () => {
  let client, clientPort, server, serverPort;
  let utilServer: UtilServer;
  let brokerToken;

  beforeAll(async () => {
    utilServer = await createUtilServer(9875);

    serverPort = 9874;
    server = await app.main({
      port: serverPort,
      client: undefined,
      config: {
        accept: serverAccept,
      },
    });

    clientPort = 9873;
    client = await app.main({
      port: clientPort,
      client: 'client',
      config: {
        brokerServerUrl: `http://localhost:${serverPort}`,
        brokerToken: '12345',
        accept: clientAccept,
      },
    });

    await new Promise((resolve) => {
      server.io.on('connection', (socket) => {
        socket.on('identify', (clientData) => {
          brokerToken = clientData.token;
          resolve(brokerToken);
        });
      });
    });
  });

  beforeEach(() => {
    jest.resetModules();
  });

  afterAll(async () => {
    await utilServer.httpServer.close();
    await client.close();
    setTimeout(async () => {
      await server.close();
    }, 100);

    await new Promise<void>((resolve) => {
      server.io.on('close', () => {
        resolve();
      });
    });
  });

  it('server healthcheck', async () => {
    const response = await axios.get(
      `http://localhost:${serverPort}/healthcheck`,
      {
        timeout: 1000,
        validateStatus: () => true,
      },
    );

    expect(response.status).toEqual(200);
    expect(response.data).toStrictEqual({ ok: true, version: version });
  });

  it('client healthcheck', async () => {
    const response = await axios.get(
      `http://localhost:${clientPort}/healthcheck`,
      {
        timeout: 1000,
        validateStatus: () => true,
      },
    );
    const body = response.data;

    expect(response.status).toEqual(200);
    expect(body).toHaveProperty('brokerServerUrl');
    expect(body).toHaveProperty('ok');
    expect(body).toHaveProperty('websocketConnectionOpen');
    expect(body).toHaveProperty('version');
    expect(body.ok).toBeTruthy();
    expect(body.websocketConnectionOpen).toBeTruthy();
  });

  it('check connection-status with connected client', async () => {
    const response = await axios.get(
      `http://localhost:${serverPort}/connection-status/${brokerToken}`,
      {
        timeout: 1000,
        validateStatus: () => true,
      },
    );
    const body = response.data;
    const expectedFilters = require(clientAccept);

    expect(response.status).toEqual(200);
    expect(body).toHaveProperty('ok');
    expect(body.ok).toBeTruthy();
    expect(body).toHaveProperty('clients');
    expect(body.clients[0]).toHaveProperty('version');
    expect(body.clients[0].version).toEqual(version);
    expect(body.clients[0]).toHaveProperty('filters');
    expect(body.clients[0].filters).toStrictEqual(expectedFilters);
  });

  it.skip('check connection-status after client disconnected', async () => {
    client.close();
    const response = await axios.get(
      `http://localhost:${serverPort}/connection-status/${brokerToken}`,
      {
        timeout: 1000,
        validateStatus: () => true,
      },
    );

    expect(response.status).toEqual(404);
  });

  it('misconfigured client fails healthcheck', async () => {
    const badClient = await app.main({
      port: 9870,
      client: 'client',
      config: {
        brokerServerUrl: 'http://no-such-server',
        brokerToken: '12345',
      },
    });

    const response = await axios.get(`http://localhost:${9870}/healthcheck`, {
      timeout: 1000,
      validateStatus: () => true,
    });
    const body = response.data;

    expect(response.status).toEqual(500);
    expect(body).toHaveProperty('brokerServerUrl');
    expect(body).toHaveProperty('ok');
    expect(body).toHaveProperty('websocketConnectionOpen');
    expect(body).toHaveProperty('version');
    expect(body.ok).not.toBeTruthy();
    expect(body.websocketConnectionOpen).not.toBeTruthy();

    await badClient.close();
    await setTimeout(() => {}, 500);
  });
});

//       t.test('check connection-status after client re-connected', (t) => {
//         client = app.main({ port: clientPort });
//         setTimeout(() => {
//           request({ url: connectionStatus, json: true }, (err, res) => {
//             if (err) {
//               return t.threw(err);
//             }
//
//             t.equal(res.statusCode, 200, '200 statusCode');
//             t.equal(res.body.ok, true, '{ ok: true } in body');
//             t.ok(res.body.clients[0].version, 'client version in body');
//             t.end();
//           });
//         }, 20);
//       });
//
//       t.test('client healthcheck after reconnection', (t) => {
//         request({ url: clientHealth, json: true }, (err, res) => {
//           if (err) {
//             return t.threw(err);
//           }
//
//           t.equal(res.statusCode, 200, '200 statusCode');
//           t.equal(res.body.ok, true, '{ ok: true } in body');
//           t.equal(
//             res.body.websocketConnectionOpen,
//             true,
//             '{ websocketConnectionOpen: true } in body',
//           );
//           t.ok(res.body.brokerServerUrl, 'brokerServerUrl in body');
//           t.ok(res.body.version, 'version in body');
//           t.end();
//         });
//       });
//
//       t.test('custom healthcheck endpoint', (t) => {
//         // launch second client to test custom client healthcheck
//         process.env.BROKER_HEALTHCHECK_PATH = '/custom/healthcheck/endpoint';
//         const customClientPort = port();
//         const customClientHealth = `http://localhost:${customClientPort}/custom/healthcheck/endpoint`;
//
//         customHealthClient = app.main({ port: customClientPort });
//
//         server.io.once('connection', (socket) => {
//           socket.once('identify', () => {
//             t.test('client custom healthcheck', (t) => {
//               request({ url: customClientHealth, json: true }, (err, res) => {
//                 if (err) {
//                   return t.threw(err);
//                 }
//
//                 t.equal(res.statusCode, 200, '200 statusCode');
//                 t.equal(res.body.ok, true, '{ ok: true } in body');
//                 t.ok(res.body.version, 'version in body');
//                 t.end();
//               });
//             });
//             t.end();
//           });
//         });
//       });
//   });
// });
