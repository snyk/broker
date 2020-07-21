import * as path from 'path';
import * as request from 'request';
import * as app from '../../lib';
import { createTestServer, getPort } from '../utils';

describe('Client CA cert', () => {
  let testServer;
  let echoServerPort;
  let serverPort;
  let server;
  let clientPort;
  let client;
  let token;

  beforeEach((done) => {
    const httpsKey = path.resolve(
      __dirname,
      '../fixtures/certs/server/privkey.pem',
    );
    const httpsCert = path.resolve(
      __dirname,
      '../fixtures/certs/server/fullchain.pem',
    );
    ({ echoServerPort, server: testServer } = createTestServer({
      httpsKey,
      httpsCert,
    }));
    clientPort = getPort();
    serverPort = getPort();

    /**
     * 1. start broker in server mode
     * 2. start broker in client mode
     * 3. run local https server with _self-signed_ cert that replicates "private server"
     * 4. send request to the server and expect error
     * 5. start broker in client mode with supplied CA cert
     * 6. send request to the server and expect success
     */
    // it('should correctly use supplied CA cert on client for connections', () => {});

    process.env.ACCEPT = 'filters.json';
    process.chdir(path.resolve(__dirname, '../fixtures/server'));
    process.env.BROKER_TYPE = 'server';

    server = app.main({ port: serverPort } as any);

    server.io.once('connection', (socket) => {
      socket.on('identify', (clientData) => {
        console.log(clientData);
        token = clientData.token;
        done();
      });
    });

    process.chdir(path.resolve(__dirname, '../fixtures/client'));
    process.env.BROKER_TYPE = 'client';
    // process.env.BROKER_TOKEN = '12345';
    // process.env.BROKER_SERVER_URL = `http://localhost:${serverPort}`;
    process.env.ORIGIN_PORT = echoServerPort;
    process.env.ACCEPT = 'filters-https.json'; // We need to connect to the https version of _internal service_
    client = app.main({
      port: clientPort,
      config: {
        brokerToken: '12345',
        brokerServerUrl: `http://localhost:${serverPort}`,
      },
    } as any);
  });

  afterEach(() => {
    testServer.close();

    if (client) {
      client.close();
    }

    if (server) {
      server.close();
    }
  });

  it('get an error trying to connect to a server with unknown CA', (done) => {
    // wait for the client to successfully connect to the server and identify itself
    const url = `http://localhost:${serverPort}/broker/${token}/echo-body`;
    request({ url, method: 'post', json: true }, (err, res) => {
      console.log(res.statusMessage);
      expect(res.statusCode).toEqual(500);
      done();
    });
  }, 5000);

  // it('launch a new client with CA set', (done) => {
  //   server.io.on('connection', (socket) => {
  //   // Specify CA file
  //   process.env.CA_CERT = '../certs/ca/my-root-ca.crt.pem';
  //   process.env.BROKER_CLIENT_VALIDATION_URL = `https://localhost:${echoServerPort}/test`;

  // t.test('launch a new client with CA set', (t) => {
  //   server.io.on('connection', (socket) => {
  //     socket.once('identify', t.end);
  //   });

  //   // Specify CA file
  //   process.env.CA_CERT = '../certs/ca/my-root-ca.crt.pem';
  //   process.env.BROKER_CLIENT_VALIDATION_URL = `https://localhost:${echoServerPort}/test`;
  //   clientPort = port();
  //   client = app.main({ port: clientPort });
  // });

  // t.test('successfully broker POST with CA set', (t) => {
  //   const url = `http://localhost:${serverPort}/broker/${token}/echo-body`;
  //   request({ url, method: 'post', json: true }, (err, res) => {
  //     t.equal(res.statusCode, 200, '200 statusCode');
  //     t.end();
  //   });
  // });

  // t.test('successfully call systemcheck with CA set', (t) => {
  //   const url = `http://localhost:${clientPort}/systemcheck`;
  //   request({ url, json: true }, (err, res) => {
  //     t.equal(res.statusCode, 200, '200 statusCode');
  //     t.end();
  //   });
  // });

  // t.test('clean up', (t) => {
  //   client.close();
  //   setTimeout(() => {
  //     server.close();
  //     t.ok('sockets closed');
  //     t.end();
  //   }, 100);
  // });
});
