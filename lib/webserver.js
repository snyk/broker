const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const debug = require('debug')('broker');

module.exports = main;

function main({ key = null, cert = null, port = 7341 } = {}, altPort = null) {
  const http = (!key && !cert); // no https if there's no certs
  const https = http ? require('http') : require('https');
  const app = express();

  app.disable('x-powered-by');
  app.use(bodyParser.json());
  app.use('/healthcheck', require('./healthcheck'));

  if (altPort) {
    port = altPort;
  }

  debug('local server listening @ %s', port);
  const serverArgs = http ? [app] : [{
    key: fs.readFileSync(key),
    cert: fs.readFileSync(cert),
  }, app];

  const server = https.createServer.apply(https, serverArgs).listen(port);

  return { app, server };
}
