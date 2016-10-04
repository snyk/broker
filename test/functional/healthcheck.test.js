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
   */

  process.env.ACCEPT = 'filters.json';

  process.chdir(path.resolve(root, '../fixtures/server'));
  process.env.BROKER_TYPE = 'server';
  const serverPort = port();
  const server = app.main({ port: serverPort });

  process.chdir(path.resolve(root, '../fixtures/client'));
  process.env.BROKER_TYPE = 'client';
  process.env.BROKER_TOKEN = '12345';
  process.env.BROKER_SERVER_URL = `http://localhost:${serverPort}`;
  const clientPort = port();
  const client = app.main({ port: clientPort });

  t.plan(3);

  t.test('server healthcheck', t => {
    const url = `http://localhost:${serverPort}/healthcheck`;
    request({url, json: true }, (err, res) => {
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
        const url = `http://localhost:${clientPort}/healthcheck`;
        request({url, json: true }, (err, res) => {
          if (err) { return t.threw(err); }

          t.equal(res.statusCode, 200, '200 statusCode');
          t.equal(res.body['ok'], true, '{ ok: true } in body');
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
