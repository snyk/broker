// process.stdout.write('\033c'); // clear the screen
const webserver = require('../lib/webserver');
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

module.exports = (tap) => {
  tap.tearDown(() => server.close());

  return {
    localPort,
    port,
    server,
  };
}
