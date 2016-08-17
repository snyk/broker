const tap = require('tap');
const test = require('tap-only');
const path = require('path');
const sinon = require('sinon');
const webserver = require('../../lib/webserver');
const App = require('../../lib');
let spy = null;
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

const server = localServer.listen(port());

// reset the spy on each test
tap.beforeEach(done => {
  spy = sinon.spy();
  done();
});

// close the server once we're done
tap.tearDown(() => server.close());

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
  const server = App(serverPort);

  process.chdir(path.resolve(root, '../fixtures/client'));
  process.env.brokerServer = `http://localhost:${serverPort}`;
  const client = App(port());

  setTimeout(() => {
    server.server.close();
    server.socket.io.end();
    client.server.close();
    client.socket.io.end();
    t.end();
  }, 500);
});
