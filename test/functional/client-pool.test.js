const tap = require('tap');
const test = require('tap-only');
const path = require('path');
const request = require('request');
const app = require('../../lib');
const root = __dirname;

const { port, echoServerPort } = require('../utils')(tap);

test('correctly handle pool of multiple clients with same BROKER_TOKEN', t => {
  /**
   * 1. start broker in server mode
   * 2. start broker in client mode and join
   * 3. run local http server that replicates "private server"
   * 4. send request to the server
   * 5. start a 2nd broker in client mode and join (2nd client becomes primary)
   * 6. send request to the server
   * 7. disconnect 1st client
   * 8. connection through server should still work through 2nd client
   *
   */

  t.plan(6);

  process.env.ACCEPT = 'filters.json';

  process.chdir(path.resolve(root, '../fixtures/server'));
  process.env.BROKER_TYPE = 'server';
  const serverPort = port();
  const server = app.main({ port: serverPort });

  process.chdir(path.resolve(root, '../fixtures/client'));
  process.env.BROKER_TYPE = 'client';
  process.env.BROKER_TOKEN = '12345';
  process.env.BROKER_SERVER_URL = `http://localhost:${serverPort}`;
  process.env.ORIGIN_PORT = echoServerPort;
  const client = app.main({ port: port() });

  let secondClient = {};

  // wait for the client to successfully connect to the server and identify itself
  server.io.once('connection', socket => {
    socket.on('identify', token => {
      t.test('successfully broker POST with 1st connected client', t => {
        const url = `http://localhost:${serverPort}/broker/${token}/echo-body`;
        request({ url, method: 'post', json: true }, (err, res) => {
          t.equal(res.statusCode, 200, '200 statusCode');
          t.end();
        });
      });

      t.test('launch a 2nd client', t => {
        server.io.on('connection', socket => {
          socket.once('identify', () => {
            t.ok('2nd client connected');
            t.end();
          });
        });

        secondClient = app.main({ port: (port() - 1) }); // Run it on a different port
      });

      t.test('successfully broker POST with 2nd client', t => {
        const url = `http://localhost:${serverPort}/broker/${token}/echo-body`;
        request({ url, method: 'post', json: true }, (err, res) => {
          t.equal(res.statusCode, 200, '200 statusCode');
          t.end();
        });
      });

      t.test('close 1st client', t => {
        client.close();
        t.ok('1st client closed');
        t.end();
      });

      t.test('successfully broker POST with 2nd client', t => {
        const url = `http://localhost:${serverPort}/broker/${token}/echo-body`;
        request({ url, method: 'post', json: true }, (err, res) => {
          t.equal(res.statusCode, 200, '200 statusCode');
          t.end();
        });
      });

      t.test('clean up', t => {
        secondClient.close();
        setTimeout(() => {
          server.close();
          t.ok('sockets closed');
          t.end();
        }, 100);
      });
    });
  });
});
