// process.stdout.write('\033c'); // clear the screen
const tap = require('tap');
const test = require('tap-only');
const path = require('path');
const request = require('request');
const app = require('../../lib');

const { port, localPort } = require('../utils')(tap);

test('no filters broker', t => {
  /**
   * 1. start broker in server mode
   * 2. start broker in client mode and join (1)
   * 3. run local http server that replicates "private serevr"
   * 4. send request to server for X file
   */

  const root = __dirname;
  process.env.ACCEPT = '';

  process.chdir(path.resolve(root, '../fixtures/server'));
  const serverPort = port();
  const server = app.main({ port: serverPort });

  process.chdir(path.resolve(root, '../fixtures/client'));
  process.env.SECRET = 'secret';
  process.env.PORT = localPort;
  process.env.BROKER_URL = `http://localhost:${serverPort}`;
  process.env.BROKER_ID = '12345';
  // invalidate the config require
  delete require.cache[require.resolve(__dirname + '/../../lib/config.js')];
  const client = app.main({ port: port() });

  // wait for the client to successfully connect to the server and identify itself
  server.io.on('connection', socket => {
    socket.on('identify', id => {
      t.plan(2);

      t.test('successfully broker with no filter should reject', t => {
        const url = `http://localhost:${serverPort}/broker/${id}/magic-path/x/package.json`;
        request({ url, method: 'post', json: true }, (err, res) => {
          t.equal(res.statusCode, 400, '400 statusCode');
          t.notEqual(res.body, true, 'body not true');
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
