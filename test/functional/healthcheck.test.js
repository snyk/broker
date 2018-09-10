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

  t.plan(9);

  const serverHealth = `http://localhost:${serverPort}/healthcheck`;
  const connectionStatus = `http://localhost:${serverPort}/` +
          `connection-status/${BROKER_TOKEN}`;
  const clientHealth = `http://localhost:${clientPort}/healthcheck`;

  // instantiated and connected later
  let customHealthClient;

  t.test('server healthcheck', t => {
    request({url: serverHealth, json: true }, (err, res) => {
      if (err) { return t.threw(err); }

      t.equal(res.statusCode, 200, '200 statusCode');
      t.equal(res.body.ok, true, '{ ok: true } in body');
      t.ok(res.body.version, 'version in body');
      t.end();
    });
  });

  // wait for the client to successfully connect to the server and identify itself
  server.io.once('connection', socket => {
    socket.once('identify', () => {
      t.test('client healthcheck after connection', t => {
        request({url: clientHealth, json: true }, (err, res) => {
          if (err) { return t.threw(err); }

          t.equal(res.statusCode, 200, '200 statusCode');
          t.equal(res.body.ok, true, '{ ok: true } in body');
          t.equal(res.body.websocketConnectionOpen, true, '{ websocketConnectionOpen: true } in body');
          t.ok(res.body.brokerServerUrl, 'brokerServerUrl in body');
          t.ok(res.body.version, 'version in body');
          t.end();
        });
      });

      t.test('check connection-status with connected client', t => {
        request({url: connectionStatus, json: true }, (err, res) => {
          if (err) { return t.threw(err); }

          t.equal(res.statusCode, 200, '200 statusCode');
          t.equal(res.body.ok, true, '{ ok: true } in body');
          t.ok(res.body.clients[0].version, 'client version in body');
          t.end();
        });
      });

      t.test('check connection-status after client disconnected', t => {
        client.close();
        setTimeout(() => {
          request({url: connectionStatus, json: true }, (err, res) => {
            if (err) { return t.threw(err); }

            t.equal(res.statusCode, 404, '404 statusCode');
            t.end();
          });
        }, 100);
      });

      t.test('misconfigured client fails healthcheck', t => {
        // set a bad server url
        process.env.BROKER_SERVER_URL = 'https://snyk.io';
        var badClient = app.main({ port: clientPort });
        // revert to a good server url
        process.env.BROKER_SERVER_URL = `http://localhost:${serverPort}`;

        request({url: clientHealth, json: true }, (err, res) => {
          if (err) { return t.threw(err); }
    
          t.equal(res.statusCode, 500, '500 statusCode');
          t.equal(res.body.ok, false, '{ ok: false } in body');
          t.equal(res.body.websocketConnectionOpen, false, '{ websocketConnectionOpen: false } in body');
          t.ok(res.body.brokerServerUrl, 'brokerServerUrl in body');
          t.ok(res.body.version, 'version in body');

          badClient.close();
          setTimeout(() => {
            t.end();
          }, 100);
        });
      });

      t.test('check connection-status after client re-connected', t => {
        client = app.main({ port: clientPort });
        setTimeout(() => {
          request({url: connectionStatus, json: true }, (err, res) => {
            if (err) { return t.threw(err); }

            t.equal(res.statusCode, 200, '200 statusCode');
            t.equal(res.body.ok, true, '{ ok: true } in body');
            t.ok(res.body.clients[0].version, 'client version in body');
            t.end();
          });
        }, 20);
      });

      t.test('client healthcheck after reconnection', t => {
        request({url: clientHealth, json: true }, (err, res) => {
          if (err) { return t.threw(err); }

          t.equal(res.statusCode, 200, '200 statusCode');
          t.equal(res.body.ok, true, '{ ok: true } in body');
          t.equal(res.body.websocketConnectionOpen, true, '{ websocketConnectionOpen: true } in body');
          t.ok(res.body.brokerServerUrl, 'brokerServerUrl in body');
          t.ok(res.body.version, 'version in body');
          t.end();
        });
      });

      t.test('custom healthcheck endpoint', t => {
        // launch second client to test custom client healthcheck
        process.env.BROKER_HEALTHCHECK_PATH = '/custom/healthcheck/endpoint';
        const customClientPort = port();
        const customClientHealth =
          `http://localhost:${customClientPort}/custom/healthcheck/endpoint`;

        customHealthClient = app.main({ port: customClientPort });

        server.io.once('connection', socket => {
          socket.once('identify', () => {
            t.test('client custom healthcheck', t => {
              request({url: customClientHealth, json: true }, (err, res) => {
                if (err) { return t.threw(err); }

                t.equal(res.statusCode, 200, '200 statusCode');
                t.equal(res.body.ok, true, '{ ok: true } in body');
                t.ok(res.body.version, 'version in body');
                t.end();
              });
            });
            t.end();
          });
        });
      });

      t.test('clean up', t => {
        customHealthClient.close();
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
