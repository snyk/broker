process.stdout.write('\033c');

const tap = require('tap');
const test = require('tap-only');
const path = require('path');
const sinon = require('sinon');
const request = require('superagent');
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
// tap.beforeEach(done => {
//   spy = sinon.spy();
//   done();
// });

// // close the server once we're done
// tap.tearDown(() => server.close());

// test('simple end to end proxying', t => {
(function () {
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
  let clientId = null;

  server.socket.io.on('identify', _ => client = _);

  process.chdir(path.resolve(root, '../fixtures/client'));
  process.env.TOKEN = 'secret';
  process.env.brokerServer = `http://localhost:${serverPort}`;
  const client = App(port());

  client.socket.io.on('open', () => {
    console.log('client is open and ready to talk');
    // get the id of the only client
    request.get(`http://localhost:${serverPort}/broker/REMY-TEST/magic-path/x/package.json`).end((err, res) => {
      console.log('request came back', res.statusCode);
      // Do something
    });
  });


  // setTimeout(() => {
  //   server.close();
  //   client.close();
  //   t.end();
  // }, 50000);
})()
