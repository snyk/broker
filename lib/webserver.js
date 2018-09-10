const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const logger = require('./log');

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

function main({ httpsKey = null, httpsCert = null, port = 7341 } = {}, altPort = null) {
  const http = (!httpsKey && !httpsCert); // no https if there's no certs
  const https = http ? require('http') : require('https');
  const app = express();

  app.disable('x-powered-by');
  app.use(markEmptyRequestBody);
  app.use(bodyParser.raw({ type: '*/*', limit: '5mb' }));
  app.use(stripEmptyRequestBody);

  if (altPort) {
    port = altPort;
  }

  logger.info({ port } , 'local server is listening');
  const serverArgs = http ? [app] : [{
    key: fs.readFileSync(httpsKey),
    cert: fs.readFileSync(httpsCert),
  }, app];

  const server = https.createServer.apply(https, serverArgs).listen(port);

  return { app, server };
}
