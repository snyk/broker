// noinspection DuplicatedCode

import * as path from 'path';
import * as version from '../../lib/version';
import axios from 'axios';
import { BrokerClient, createBrokerClient } from '../setup/broker-client';
import { BrokerServer, createBrokerServer } from '../setup/broker-server';
import { TestWebServer, createTestWebServer } from '../setup/test-web-server';

const fixtures = path.resolve(__dirname, '..', 'fixtures');
const serverAccept = path.join(fixtures, 'server', 'filters.json');
const clientAccept = path.join(fixtures, 'client', 'filters.json');

describe('proxy requests originating from behind the broker client', () => {
  let tws: TestWebServer;
  let bs: BrokerServer;
  let bc: BrokerClient;
  let brokerToken: string;

  beforeAll(async () => {
    tws = await createTestWebServer();

    bs = await createBrokerServer({ filters: serverAccept });

    bc = await createBrokerClient({
      brokerServerUrl: `http://localhost:${bs.port}`,
      brokerToken: '12345',
      filters: clientAccept,
    });

    await new Promise((resolve) => {
      bs.server.io.on('connection', (socket) => {
        socket.on('identify', (clientData) => {
          brokerToken = clientData.token;
          resolve(brokerToken);
        });
      });
    });
  });

  afterAll(async () => {
    await tws.server.close();
    setTimeout(async () => {
      await bc.client.close();
    }, 100);
    await new Promise<void>((resolve) => {
      bc.client.io.on('close', () => {
        resolve();
      });
    });

    setTimeout(async () => {
      await bs.server.close();
    }, 100);
    await new Promise<void>((resolve) => {
      bs.server.io.on('close', () => {
        resolve();
      });
    });
  });

  it.skip('server healthcheck', async () => {
    const response = await axios.get(
      `http://localhost:${bs.port}/healthcheck`,
      {
        timeout: 1000,
        validateStatus: () => true,
      },
    );

    expect(response.status).toEqual(200);
    expect(response.data).toStrictEqual({ ok: true, version: version });
  });

  it.skip('client healthcheck', async () => {
    const response = await axios.get(
      `http://localhost:${bc.port}/healthcheck`,
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

  it.skip('check connection-status with connected client', async () => {
    const response = await axios.get(
      `http://localhost:${bs.port}/connection-status/${brokerToken}`,
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
    setTimeout(async () => {
      await bc.client.close();
    }, 100);
    await new Promise<void>((resolve) => {
      bc.client.io.on('close', () => {
        resolve();
      });
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 5000);
    });

    const response = await axios.get(
      `http://localhost:${bs.port}/connection-status/${brokerToken}`,
      {
        timeout: 1000,
        validateStatus: () => true,
      },
    );

    expect(response.status).toEqual(404);

    // bc = await createBrokerClient({
    //   brokerServerUrl: `http://localhost:${bs.port}`,
    //   brokerToken: '12345',
    //   filters: clientAccept,
    // });
    // await new Promise((resolve) => {
    //   bs.server.io.on('connection', (socket) => {
    //     socket.on('identify', (clientData) => {
    //       brokerToken = clientData.token;
    //       resolve(brokerToken);
    //     });
    //   });
    // });
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

  // describe('for misconfigured clients', () => {
  //   let badClient;
  //   beforeAll(async () => {
  //     badClient = await createBrokerClient({
  //       brokerToken: '67890',
  //       brokerServerUrl: 'http://no-such-server',
  //       port: bc.port + 10,
  //     });
  //   });
  //   afterAll(async () => {
  //     setTimeout(async () => {
  //       await badClient.client.close();
  //     }, 100);
  //     await new Promise<void>((resolve) => {
  //       badClient.client.io.on('close', () => {
  //         resolve();
  //       });
  //     });
  //   });
  //
  //   it('should fail by healthcheck', async () => {
  //     try {
  //       const response = await axios.get(
  //         `http://localhost:${badClient.port}/healthcheck`,
  //         {
  //           timeout: 1000,
  //           validateStatus: () => true,
  //         },
  //       );
  //       expect(response.status).toEqual(500);
  //       expect(response.data).toStrictEqual({
  //         brokerServerUrl: 'http://no-such-server',
  //         ok: false,
  //         transport: expect.any(String),
  //         version: expect.any(String),
  //         websocketConnectionOpen: false,
  //       });
  //     } catch (error) {
  //       LOG.info(error, 'error by failed healthcheck');
  //     }
  //   });
  // });
});
