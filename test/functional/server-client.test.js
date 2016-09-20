// process.stdout.write('\033c'); // clear the screen
const tap = require('tap');
const test = require('tap-only');
const path = require('path');
const request = require('request');
const app = require('../../lib');
const root = __dirname;

const { port, echoServerPort } = require('../utils')(tap);

test('proxy requests originating from behind the broker server', t => {
  /**
   * 1. start broker in server mode
   * 2. start broker in client mode and join (1)
   * 3. run local http server that replicates "private server"
   * 4. send requests to **server**
   *
   * Note: client is forwarding requests to echo-server defined in test/util.js
   */

  process.env.ACCEPT = 'filters.json';

  process.chdir(path.resolve(root, '../fixtures/server'));
  process.env.BROKER_TYPE = 'server';
  const serverPort = port();
  const server = app.main({ port: serverPort });

  process.chdir(path.resolve(root, '../fixtures/client'));
  process.env.BROKER_TYPE = 'client';
  process.env.BROKER_ID = '12345';
  process.env.BROKER_URL = `http://localhost:${serverPort}`;
  process.env.ORIGIN_PORT = echoServerPort;
  const client = app.main({ port: port() });

  // wait for the client to successfully connect to the server and identify itself
  server.io.on('connection', socket => {
    socket.on('identify', id => {
      t.plan(6);

      t.test('successfully broker POST', t => {
        const url = `http://localhost:${serverPort}/broker/${id}/echo-body`;
        const body = { some: { example: 'json' }};
        request({ url, method: 'post', json: true, body }, (err, res) => {
          t.equal(res.statusCode, 200, '200 statusCode');
          t.same(res.body, body, 'body brokered');
          t.end();
        });
      });

      t.test('successfully broker GET', t => {
        const url = `http://localhost:${serverPort}/broker/${id}/echo-param/xyz`;
        request({ url, method: 'get' }, (err, res) => {
          t.equal(res.statusCode, 200, '200 statusCode');
          t.equal(res.body, 'xyz', 'body brokered');
          t.end();
        });
      });

      // the variable substitution takes place in the broker client
      t.test('variable subsitution', t => {
        const url = `http://localhost:${serverPort}/broker/${id}/echo-body`;
        const body = {
          BROKER_VAR_SUB: ['swap.me'],
          swap: { me: '${BROKER_TYPE}:${BROKER_ID}' },
        };
        request({ url, method: 'post', json: true, body }, (err, res) => {
          const swappedBody = {
            BROKER_VAR_SUB: ['swap.me'],
            swap: { me: 'client:12345' },
          };
          t.equal(res.statusCode, 200, '200 statusCode');
          t.same(res.body, swappedBody, 'body brokered');
          t.end();
        });
      })

      t.test('block invalid request', t => {
        const url = `http://localhost:${serverPort}/broker/${id}/not-allowed`;
        request({ url, 'method': 'post', json: true }, (err, res, body) => {
          t.equal(res.statusCode, 401, '401 statusCode');
          t.equal(body, 'blocked', '"blocked" body: ' + body);
          t.end();
        });
      });

      t.test('bad broker id', t => {
        const url = `http://localhost:${serverPort}/broker/${id}XXX/echo-body`;
        request({ url, 'method': 'post', json: true }, (err, res) => {
          t.equal(res.statusCode, 404, '404 statusCode');
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
