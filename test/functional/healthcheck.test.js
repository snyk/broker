const tap = require('tap');
const test = require('tap-only');
const path = require('path');
const request = require('request');
const app = require('../../lib');

const { port, localPort } = require('../utils')(tap);

test('server healthcheck', t => {
  /**
   * 1. start broker in server mode
   * 2. send healthcheck request to server, assert HTTP 200 and `{ ok: true }`
   */

  const root = __dirname;

  process.chdir(path.resolve(root, '../fixtures/server'));
  const serverPort = port();
  process.env.BROKER_TYPE = 'server';
  process.env.ACCEPT = 'filters.json';
  const server = app.main({ port: serverPort });

  const url = `http://localhost:${serverPort}/healthcheck`;
  request({url, json: true }, (err, res) => {
    if (err) {
      t.fail(err);
    }

    t.equal(res.statusCode, 200, '200 statusCode');
    t.equal(res.body['ok'], true, '{ ok: true } in body');
    server.close();
    t.end();
  });
});

test('client healthcheck', t => {
  /**
   * 1. start broker in client mode
   * 2. send healthcheck request to server, assert HTTP 200 and `{ ok: true }`
   */

  const root = __dirname;

  process.chdir(path.resolve(root, '../fixtures/client'));
  const serverPort = port();
  process.env.SECRET = 'secret';
  process.env.PORT = localPort;
  process.env.ACCEPT = 'filters.json';
  // process.env.BROKER_URL = `http://localhost:${serverPort}`;
  // process.env.BROKER_ID = '12345';
  process.env.BROKER_TYPE = 'client';
  const client = app.main({ port: port() });

  const url = `http://localhost:${localPort}/healthcheck`;
  request({url, json: true }, (err, res) => {
    if (err) {
      t.fail(err);
    }

    t.equal(res.statusCode, 200, '200 statusCode');
    t.equal(res.body['ok'], true, '{ ok: true } in body');
    client.close();
    t.end();
  });
});
