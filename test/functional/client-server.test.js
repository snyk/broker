// process.stdout.write('\033c'); // clear the screen
const tap = require('tap');
const test = require('tap-only');
const path = require('path');
const request = require('request');
// require('request-debug')(request);
const app = require('../../lib');
const root = __dirname;

const { port, echoServerPort } = require('../utils')(tap);

test('proxy requests originating from behind the broker client', t => {
  /**
   * 1. start broker in server mode
   * 2. start broker in client mode and join (1)
   * 3. run local http server that replicates "private server"
   * 4. send requests to **client**
   *
   * Note: server is forwarding requests to echo-server defined in test/util.js
   */

  process.env.ACCEPT = 'filters.json';

  process.chdir(path.resolve(root, '../fixtures/server'));
  process.env.BROKER_TYPE = 'server';
  process.env.ORIGIN_PORT = echoServerPort;
  const serverPort = port();
  const server = app.main({ port: serverPort });

  process.chdir(path.resolve(root, '../fixtures/client'));
  process.env.BROKER_TYPE = 'client';
  process.env.BROKER_TOKEN = 'C481349B-4014-43D9-B59D-BA41E1315001'; // uuid.v4
  process.env.BROKER_SERVER_URL = `http://localhost:${serverPort}`;
  const clientPort = port();
  const client = app.main({ port: clientPort });

  // wait for the client to successfully connect to the server and identify itself
  server.io.once('connection', socket => {
    socket.once('identify', clientData => {
      t.plan(12);

      t.test('successfully broker POST', t => {
        const url = `http://localhost:${clientPort}/echo-body`;
        const body = { some: { example: 'json' }};
        request({ url, method: 'post', json: true, body }, (err, res) => {
          t.equal(res.statusCode, 200, '200 statusCode');
          t.same(res.body, body, 'body brokered');
          t.end();
        });
      });

      t.test('successfully broker exact bytes of POST body', t => {
        const url = `http://localhost:${clientPort}/echo-body`;
        // stringify the JSON unusually to ensure an unusual exact body
        const body = Buffer.from(
          JSON.stringify({ some: { example: 'json' }}, null, 5)
        );
        const headers = { 'Content-Type': 'application/json' };
        request({ url, method: 'post', headers, body }, (err, res) => {
          const responseBody = Buffer.from(res.body);
          t.equal(res.statusCode, 200, '200 statusCode');
          t.same(responseBody, body, 'body brokered exactly');
          t.end();
        });
      });

      t.test('successfully broker GET', t => {
        const url = `http://localhost:${clientPort}/echo-param/xyz`;
        request({ url, method: 'get' }, (err, res) => {
          t.equal(res.statusCode, 200, '200 statusCode');
          t.equal(res.body, 'xyz', 'body brokered');
          t.end();
        });
      });

      // the filtering happens in the broker client
      t.test('block request for non-whitelisted url', t => {
        const url = `http://localhost:${clientPort}/not-allowed`;
        request({ url, 'method': 'post', json: true }, (err, res, body) => {
          t.equal(res.statusCode, 401, '401 statusCode');
          t.equal(body.message, 'blocked', '"blocked" body: ' + body);
          t.equal(body.reason, 'Request does not match any accept rule, blocking HTTP request', 'Block message');
          t.equal(body.url, '/not-allowed', 'Blocked url');
          t.end();
        });
      });

      // the filtering happens in the broker client
      t.test('allow request for valid url with valid body', t => {
        const url = `http://localhost:${clientPort}/echo-body/filtered`;
        const body = { proxy: { me: 'please' }};
        request({ url, method: 'post', json: true, body }, (err, res) => {
          t.equal(res.statusCode, 200, '200 statusCode');
          t.same(res.body, body, 'body brokered');
          t.end();
        });
      });

      // the filtering happens in the broker client
      t.test('block request for valid url with invalid body', t => {
        const url = `http://localhost:${clientPort}/echo-body/filtered`;
        const body = { proxy: { me: 'now!' }};
        request({ url, 'method': 'post', json: true, body }, (err, res, body) => {
          t.equal(res.statusCode, 401, '401 statusCode');
          t.equal(body.message, 'blocked', '"blocked" body: ' + body);
          t.end();
        });
      });

      // the filtering happens in the broker client
      t.test('allow request for valid url with valid query param', t => {
        const url = `http://localhost:${clientPort}/echo-query/filtered`;
        const qs = { proxyMe: 'please' };
        request({ url, method: 'get', json: true, qs }, (err, res) => {
          t.equal(res.statusCode, 200, '200 statusCode');
          t.same(res.body, qs, 'querystring brokered');
          t.end();
        });
      });

      // the filtering happens in the broker client
      t.test('block request for valid url with invalid query param', t => {
        const url = `http://localhost:${clientPort}/echo-query/filtered`;
        const qs = { proxyMe: 'now!' };
        request({ url, 'method': 'get', qs }, (err, res) => {
          t.equal(res.statusCode, 401, '401 statusCode');
          t.end();
        });
      });

      // the filtering happens in the broker client
      t.test('block request for valid url with missing query param', t => {
        const url = `http://localhost:${clientPort}/echo-query/filtered`;
        request({ url, 'method': 'get' }, (err, res) => {
          t.equal(res.statusCode, 401, '401 statusCode');
          t.end();
        });
      });

      // this validates that the broker *server* sends to the correct broker token
      // header to the echo-server
      t.test('broker ID is included in headers from server to private', t => {
        const url = `http://localhost:${clientPort}/echo-headers`;
        request({ url, method: 'post' }, (err, res) => {
          const responseBody = JSON.parse(res.body);
          t.equal(res.statusCode, 200, '200 statusCode');
          t.equal(responseBody['x-broker-token'], clientData.token.toLowerCase(),
            'X-Broker-Token header present and lowercased');
          t.end();
        });
      });

      t.test('querystring parameters are brokered', t => {
        const url = `http://localhost:${clientPort}/echo-query?shape=square&colour=yellow`;
        request({ url, method: 'get' }, (err, res) => {
          const responseBody = JSON.parse(res.body);
          t.equal(res.statusCode, 200, '200 statusCode');
          t.same(responseBody, {shape: 'square', colour: 'yellow'},
            'querystring brokered');
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
