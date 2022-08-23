const test = require('tap-only');
const path = require('path');
const request = require('request');
const app = require('../../lib');
const version = require('../../lib/version');
const root = __dirname;

const { port, createTestServer } = require('../utils');

test('proxy requests originating from behind the broker server with pooled credentials', (t) => {
  /**
   * 1. start broker in server mode
   * 2. start broker in client mode and join (1)
   * 3. run local http server that replicates "private server"
   * 4. send requests to **server**
   *
   * Note: client is forwarding requests to echo-server defined in test/util.js
   */

  const { echoServerPort, testServer } = createTestServer();

  t.teardown(() => {
    testServer.close();
  });

  const ACCEPT = 'filters.json';
  process.env.ACCEPT = ACCEPT;

  process.chdir(path.resolve(root, '../fixtures/server'));
  process.env.BROKER_TYPE = 'server';
  const serverPort = port();
  const server = app.main({ port: serverPort });

  const clientRootPath = path.resolve(root, '../fixtures/client');
  process.chdir(clientRootPath);
  const BROKER_SERVER_URL = `http://localhost:${serverPort}`;
  const BROKER_TOKEN = '98f04768-50d3-46fa-817a-9ee6631e9970';
  process.env.BROKER_TYPE = 'client';
  process.env.GITHUB = 'github.com';
  process.env.BROKER_TOKEN = BROKER_TOKEN;
  process.env.BROKER_SERVER_URL = BROKER_SERVER_URL;
  process.env.ORIGIN_PORT = echoServerPort;
  process.env.USERNAME = 'user@email.com';
  process.env.PASSWORD = 'not-used';
  process.env.PASSWORD1 = 'aB}#/:%40*1';
  process.env.PASSWORD2 = 'aB}#/:%40*2';
  process.env.PASSWORD_ARRAY = '$PASSWORD1, $PASSWORD2';
  const client = app.main({ port: port() });

  // wait for the client to successfully connect to the server and identify itself
  server.io.on('connection', (socket) => {
    socket.on('identify', (clientData) => {
      const token = clientData.token;
      t.plan(5);

      t.test('identification', (t) => {
        const filters = require(`${clientRootPath}/${ACCEPT}`);
        t.equal(clientData.token, BROKER_TOKEN, 'correct token');
        t.deepEqual(
          clientData.metadata,
          {
            version,
            filters,
          },
          'correct metadata',
        );
        t.end();
      });

      t.test(
        'successfully broker on endpoint that forwards requests with basic auth, using first credential',
        (t) => {
          const url = `http://localhost:${serverPort}/broker/${token}/basic-auth`;
          request({ url, method: 'get' }, (err, res) => {
            t.equal(res.statusCode, 200, '200 statusCode [1]');

            const auth = res.body.replace('Basic ', '');
            const encodedAuth = Buffer.from(auth, 'base64').toString('utf-8');
            t.equal(
              encodedAuth,
              `${process.env.USERNAME}:${process.env.PASSWORD1}`,
              'auth header is set correctly [1]',
            );
            t.end();
          });
        },
      );

      t.test(
        'successfully broker on endpoint that forwards requests with basic auth, using second credential',
        (t) => {
          const url = `http://localhost:${serverPort}/broker/${token}/basic-auth`;
          request({ url, method: 'get' }, (err, res) => {
            t.equal(res.statusCode, 200, '200 statusCode [2]');

            const auth = res.body.replace('Basic ', '');
            const encodedAuth = Buffer.from(auth, 'base64').toString('utf-8');
            t.equal(
              encodedAuth,
              `${process.env.USERNAME}:${process.env.PASSWORD2}`,
              'auth header is set correctly [2]',
            );
            t.end();
          });
        },
      );

      t.test(
        'successfully broker on endpoint that forwards requests with basic auth, using first credential again',
        (t) => {
          const url = `http://localhost:${serverPort}/broker/${token}/basic-auth`;
          request({ url, method: 'get' }, (err, res) => {
            t.equal(res.statusCode, 200, '200 statusCode [3]');

            const auth = res.body.replace('Basic ', '');
            const encodedAuth = Buffer.from(auth, 'base64').toString('utf-8');
            t.equal(
              encodedAuth,
              `${process.env.USERNAME}:${process.env.PASSWORD1}`,
              'auth header is set correctly [3]',
            );
            t.end();
          });
        },
      );

      t.test('clean up', (t) => {
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
