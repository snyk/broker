const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const debug = require('debug')('broker');

module.exports = main;

// bodyparser < 2 initializes req.body to {} for requests with no body. This
// breaks later serialization, so this pair of middlewares ensures that requests
// with no body have req.body = undefined. This matches the as-yet-unreleased
// bodyparser 2.x behaviour.
const EmptyBody = Symbol('Empty Body');
const markEmptyRequestBody = (req, res, next) => {
  req.body = req.body || EmptyBody;
  next();
};
const stripEmptyRequestBody = (req, res, next) => {
  if (req.body === EmptyBody) {
    delete req.body;
  }
  next();
};

function main({ key = null, cert = null, port = 7341 } = {}, altPort = null) {
  const http = (!key && !cert); // no https if there's no certs
  const https = http ? require('http') : require('https');
  const app = express();

  app.disable('x-powered-by');
  app.use(markEmptyRequestBody);
  app.use(bodyParser.raw({ type: '*/*' }));
  app.use(stripEmptyRequestBody);
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
