// process.stdout.write('\033c'); // clear the screen
const tap = require('tap');
const test = require('tap-only');
const path = require('path');
const request = require('request');
const App = require('../../lib');

const { port, localPort } = require('../utils')(tap);

test('simple end to end proxying', t => {
  /**
   * 1. start broker in server mode
   * 2. start broker in client mode and join (1)
   * 3. run local http server that replicates "private serevr"
   * 4. send request to server for X file
   */

  const root = __dirname;

  process.chdir(path.resolve(root, '../fixtures/server'));
  const serverPort = port();
  const server = App({ port: serverPort });

  process.chdir(path.resolve(root, '../fixtures/client'));
  process.env.SECRET = 'secret';
  process.env.PORT = localPort;
  process.env.ACCEPT = 'filters.json';
  process.env.BROKER_SERVER = `http://localhost:${serverPort}`;
  process.env.BROKER_ID = '12345';
  const client = App({ port: port() });

  // wait for the client to successfully connect to the server and identify itself
  server.socket.io.on('connection', socket => {
    socket.on('identify', id => {

      t.plan(4);

      t.test('successfully broker', t => {
        const url = `http://localhost:${serverPort}/broker/${id}/magic-path/x/package.json`;
        request({ url, method: 'post', json: true }, (err, res) => {
          t.equal(res.statusCode, 200, '200 statusCode');
          t.equal(res.body, true, 'body true');
          t.end();
        });
      });

      t.test('filtered request to broker', t => {
        const url = `http://localhost:${serverPort}/broker/${id}/magic-path/x/random.json`;
        request({ url, 'method': 'post', json: true }, (err, res) => {
          t.equal(res.statusCode, 400, '400 statusCode');
          t.match(res.body.toString(), /blocked/, '"blocked" body');
          t.end();
        });
      });

      t.test('bad broker id', t => {
        const url = `http://localhost:${serverPort}/broker/${id}XXX/magic-path/x/random.json`;
        request({ url, 'method': 'post', json: true }, (err, res) => {
          t.equal(res.statusCode, 404, '404 statusCode');
          t.end();
        });
      });

      t.test('clean up', t => {
        server.close();
        client.close();
        t.ok('sockets closed');
        t.end();
      });
    });
  });
});
