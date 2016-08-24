// process.stdout.write('\033c'); // clear the screen
const webserver = require('../lib/webserver');
let p = 9876;

function port() {
  return --p;
}

// this is our fake local and private web server
const localPort = port();
const { app:localServer, server } = webserver({
  http: true,
  port: localPort,
});

localServer.get('/service/:param', (req, res) => {
  res.send(req.params.param);
});

localServer.post('/magic-path/secret/package.json', (req, res) => {
  res.send(true);
});

localServer.all('*', (req, res) => {
  res.send(false);
});


module.exports = (tap) => {
  tap.tearDown(() => {
    server.close();
  });

  return {
    localPort,
    port,
    server,
    resetConfig: () => {
      delete require.cache[require.resolve(__dirname + '/../lib/config.js')];
    }
  };
};
