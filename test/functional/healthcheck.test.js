const tap = require('tap');
const test = require('tap-only');
const path = require('path');
const request = require('request');
const app = require('../../lib');
const root = __dirname;

const { port } = require('../utils')(tap);

test('proxy requests originating from behind the broker client', t => {
  /**
   * 1. start broker in server mode
   * 2. start broker in client mode and join (1)
   * 3. check /healthcheck on client and server
   * 4. stop client and check it's on "disconnected" in the server
   * 5. restart client with same token, make sure it's not in "disconnected"
   */

  process.env.ACCEPT = 'filters.json';

  process.chdir(path.resolve(root, '../fixtures/server'));
  process.env.BROKER_TYPE = 'server';
  const serverPort = port();
  const server = app.main({ port: serverPort });
  const BROKER_TOKEN = '12345';

  process.chdir(path.resolve(root, '../fixtures/client'));
  process.env.BROKER_TYPE = 'client';
  process.env.BROKER_TOKEN = BROKER_TOKEN;
  process.env.BROKER_SERVER_URL = `http://localhost:${serverPort}`;
  const clientPort = port();
  let client = app.main({ port: clientPort });

  t.plan(6);

  const serverHealth = `http://localhost:${serverPort}/healthcheck`;
  const serverClientHealth = `http://localhost:${serverPort}/` +
          `broker/${BROKER_TOKEN}`;
  const clientHealth = `http://localhost:${clientPort}/healthcheck`;
  t.test('server healthcheck', t => {
    request({url: serverHealth, json: true }, (err, res) => {
      if (err) { return t.threw(err); }

      t.equal(res.statusCode, 200, '200 statusCode');
      t.equal(res.body['ok'], true, '{ ok: true } in body');
      t.end();
    });
  });

  // wait for the client to successfully connect to the server and identify itself
  server.io.once('connection', socket => {
    socket.once('identify', () => {
      t.test('client healthcheck', t => {
        request({url: clientHealth, json: true }, (err, res) => {
          if (err) { return t.threw(err); }

          t.equal(res.statusCode, 200, '200 statusCode');
          t.equal(res.body['ok'], true, '{ ok: true } in body');
          t.end();
        });
      });

      t.test('serve client-health with connected client', t => {
        request({url: serverClientHealth, json: true }, (err, res) => {
          if (err) { return t.threw(err); }

          t.equal(res.statusCode, 200, '200 statusCode');
          t.equal(res.body['ok'], true, '{ ok: true } in body');
          t.end();
        });
      });

      t.test('server client-health after client disconnected', t => {
        client.close();
        setTimeout(() => {
          request({url: serverClientHealth, json: true }, (err, res) => {
            if (err) { return t.threw(err); }

            t.equal(res.statusCode, 404, '404 statusCode');
            t.end();
          });
        }, 100);
      });

      t.test('server client-health after client re-connected', t => {
        client = app.main({ port: clientPort });
        setTimeout(() => {
          request({url: serverClientHealth, json: true }, (err, res) => {
            if (err) { return t.threw(err); }

            t.equal(res.statusCode, 200, '200 statusCode');
            t.equal(res.body['ok'], true, '{ ok: true } in body');
            t.end();
          });
        }, 20);
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
