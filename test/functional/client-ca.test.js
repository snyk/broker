const tap = require('tap');
const test = require('tap-only');
const request = require('request');
const path = require('path');
const app = require('../../lib');
const root = __dirname;

process.env.TEST_KEY = path.resolve(root, '../fixtures/certs/server/privkey.pem');
process.env.TEST_CERT = path.resolve(root, '../fixtures/certs/server/fullchain.pem');

const { port, echoServerPort } = require('../utils')(tap);

test('correctly use supplied CA cert on client for connections', t => {
  /**
   * 1. start broker in server mode
   * 2. start broker in client mode
   * 3. run local https server with _self-signed_ cert that replicates "private server"
   * 4. send request to the server and expect error
   * 5. start broker in client mode with supplied CA cert
   * 6. send request to the server and expect success
   */

  t.plan(6);

  process.env.ACCEPT = 'filters.json';

  process.chdir(path.resolve(root, '../fixtures/server'));
  process.env.BROKER_TYPE = 'server';
  let clientPort;
  const serverPort = port();
  const server = app.main({ port: serverPort });

  process.chdir(path.resolve(root, '../fixtures/client'));
  process.env.BROKER_TYPE = 'client';
  process.env.BROKER_TOKEN = '12345';
  process.env.BROKER_SERVER_URL = `http://localhost:${serverPort}`;
  process.env.ORIGIN_PORT = echoServerPort;
  process.env.ACCEPT = 'filters-https.json'; // We need to connect to the https version of _internal service_
  let client = app.main({ port: port() });

  // wait for the client to successfully connect to the server and identify itself
  server.io.once('connection', socket => {
    socket.on('identify', clientData => {
      const token = clientData.token;
      t.test('get an error trying to connect to a server with unknown CA', t => {
        const url = `http://localhost:${serverPort}/broker/${token}/echo-body`;
        request({ url, method: 'post', json: true }, (err, res) => {
          t.equal(res.statusCode, 500, '500 statusCode');
          t.end();
        });
      });

      t.test('close', t => {
        client.close();
        t.ok('client closed');
        t.end();
      });

      t.test('launch a new client with CA set', t => {
        server.io.on('connection', socket => {
          socket.once('identify', t.end);
        });

        // Specify CA file
        process.env.CA_CERT = '../certs/ca/my-root-ca.crt.pem';
        process.env.BROKER_CLIENT_VALIDATION_URL = `https://localhost:${echoServerPort}/test`;
        clientPort = port();
        client = app.main({ port: clientPort });
      });

      t.test('successfully broker POST with CA set', t => {
        const url = `http://localhost:${serverPort}/broker/${token}/echo-body`;
        request({ url, method: 'post', json: true }, (err, res) => {
          t.equal(res.statusCode, 200, '200 statusCode');
          t.end();
        });
      });

      t.test('successfully call systemcheck with CA set', t => {
        const url = `http://localhost:${clientPort}/systemcheck`;
        request({ url, json: true }, (err, res) => {
          t.equal(res.statusCode, 200, '200 statusCode');
          t.end();
        });
      });

      t.test('clean up', t => {
        client.close();
        setTimeout(() => {
          server.close();
          t.ok('sockets closed');
          t.end();
        }, 100);
      });
    });
  });
});
