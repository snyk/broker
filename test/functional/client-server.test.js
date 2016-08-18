// process.stdout.write('\033c'); // clear the screen
const tap = require('tap');
const test = require('tap-only');
const path = require('path');
const request = require('request');
const App = require('../../lib');
const root = __dirname;

const { port, localPort: servicePort } = require('../utils')(tap);

test('internal sends request through client', t => {

  // same setup as normal
  process.chdir(path.resolve(root, '../fixtures/server'));
  process.env.ACCEPT = 'filters.json';
  process.env.PORT = servicePort;
  const serverPort = port();
  const server = App({ port: serverPort });

  process.chdir(path.resolve(root, '../fixtures/client'));
  process.env.BROKER_SERVER = `http://localhost:${serverPort}`;
  process.env.BROKER_ID = '12345';
  const localPort = port();
  const client = App({ port: localPort });

  // wait for the client to successfully connect to the server and identify itself
  server.socket.io.on('connection', socket => {
    socket.on('identify', () => {
      t.plan(2);

      t.test('client can forward requests FROM internal service', t => {
        const url = `http://localhost:${localPort}/service/test1`;
        request({ url, method: 'get', json: true }, (err, res) => {
          t.equal(res.statusCode, 200, '200 statusCode');
          t.equal(res.body, 'test1', 'body correct');
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
