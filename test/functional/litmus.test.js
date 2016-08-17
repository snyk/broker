// process.stdout.write('\033c'); // clear the screen
const tap = require('tap');
const test = require('tap-only');
const path = require('path');
const request = require('superagent');
const webserver = require('../../lib/webserver');
const App = require('../../lib');
let p = 9876;

function port() {
  return --p;
}

// this is our fake local and private web server
const localServer = webserver({
  http: true,
});

localServer.post('/magic-path/secret/package.json', (req, res) => {
  res.send(true);
});

localServer.all('*', (req, res) => {
  res.send(false);
});

const localPort = port();
const server = localServer.listen(localPort);

// // reset the spy on each test
// tap.beforeEach(done => {
//   spy = sinon.spy();
//   done();
// });

// close the server once we're done
tap.tearDown(() => server.close());

test('simple end to end proxying', t => {
// (function () {
  /**
   * 1. start broker in server mode
   * 2. start broker in client mode and join (1)
   * 3. run local http server that replicates "private serevr"
   * 4. send request to server for X file
   */

  const root = __dirname;

  process.chdir(path.resolve(root, '../fixtures/server'));
  const serverPort = port();
  const server = App(serverPort);

  process.chdir(path.resolve(root, '../fixtures/client'));
  process.env.SECRET = 'secret';
  process.env.PORT = localPort;
  process.env.ACCEPT = 'filters.json';
  process.env.BROKER_SERVER = `http://localhost:${serverPort}`;
  const client = App(port());

  // wait for the client to successfully connect to the server and identify itself
  server.socket.io.on('connection', socket => {
    socket.on('identify', id => {
      // get the id of the only client
      const url = `http://localhost:${serverPort}/broker/${id}/magic-path/x/package.json`;
      request.post(url, {}).end((err, res) => {
        t.equal(res.statusCode, 200, 'statusCode');
        t.equal(res.body, true, 'body');

        server.close();
        client.close();
        t.end();
      });
    });
  });
});
