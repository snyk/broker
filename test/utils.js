const compression = require('compression');
// process.stdout.write('\033c'); // clear the screen
const webserver = require('../lib/webserver');

let p = 9876;

function port() {
  return --p;
}

// this is our fake local and private web server
const echoServerPort = port();
const { app: echoServer, server } = webserver({
  port: echoServerPort,
  httpsKey: process.env.TEST_KEY, // Optional
  httpsCert: process.env.TEST_CERT, // Optional
  httpsPassphrase: process.env.TEST_PASSPHRASE, // Optional
});

echoServer.use(compression());

echoServer.get('/test', (req, res) => {
  res.status(200);
  res.send('All good');
});

echoServer.get('/test-blob/1', (req, res) => {
  res.setHeader('test-orig-url', req.originalUrl);
  res.status(299);

  const buf = Buffer.alloc(500);
  for (let i = 0; i < 500; i++) {
    buf.writeUInt8(i & 0xff, i);
  }
  res.send(buf);
});

echoServer.get('/test-blob/2', (req, res) => {
  res.setHeader('test-orig-url', req.originalUrl);
  res.status(500);
  res.send('Test Error');
});

echoServer.get('/basic-auth', (req, res) => {
  res.send(req.headers.authorization);
});

echoServer.get('/echo-param/:param', (req, res) => {
  res.send(req.params.param);
});

echoServer.get('/echo-param-protected/:param', (req, res) => {
  res.send(req.params.param);
});

echoServer.post('/echo-body/:param?', (req, res) => {
  const contentType = req.get('Content-Type');
  if (contentType) {
    res.type(contentType);
  }
  res.send(req.body);
});

echoServer.post('/echo-headers/:param?', (req, res) => {
  res.json(req.headers);
});

echoServer.get('/echo-query/:param?', (req, res) => {
  res.json(req.query);
});

echoServer.get('/long/nested/*', (req, res) => {
  res.send(req.originalUrl);
});

echoServer.get('/repos/owner/repo/contents/folder/package.json', (req, res) => {
  res.json({ headers: req.headers, query: req.query, url: req.url });
});

echoServer.all('*', (req, res) => {
  res.send(false);
});

module.exports = (tap) => {
  tap.tearDown(() => {
    server.close();
  });

  return {
    echoServerPort,
    port,
    server,
  };
};
