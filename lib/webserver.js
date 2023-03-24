const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const logger = require('./log');
const { maskToken } = require('./token');

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

const extractBrokerTokenFromUrl = (urlString = '') => {
  const regex = /^\/broker\/([a-z0-9-]+)\//;
  return urlString.match(regex) ? urlString.match(regex)[1] : null;
};

function main(config = {}, altPort = null) {
  let { httpsKey = null, httpsCert = null, port = 7341 } = config;
  const http = !httpsKey && !httpsCert; // no https if there's no certs
  const https = http ? require('http') : require('https');
  const app = express();

  app.disable('x-powered-by');

  app.use(markEmptyRequestBody);
  app.use(
    bodyParser.raw({
      type: (req) =>
        req.headers['content-type'] !==
        'application/vnd.broker.stream+octet-stream',
      limit: '10mb',
    }),
  );
  app.use(stripEmptyRequestBody);
  app.use((err, req, res, next) => {
    if (err) {
      const brokerToken = extractBrokerTokenFromUrl(req.url);
      const maskedToken = maskToken(brokerToken);
      logger.error(
        {
          url: req.url.replaceAll(brokerToken, maskedToken),
          requestMethod: req.method,
          requestHeaders: req.headers,
          requestId: req.headers['snyk-request-id'] || '',
          maskedToken: maskedToken,
          error: err,
        },
        'Error occurred receiving http request on broker webserver',
      );
      next(err);
    } else {
      next(err);
    }
  });

  if (altPort) {
    port = altPort;
  }

  logger.info({ port }, 'local server is listening');
  const serverArgs = http
    ? [app]
    : [
        {
          key: fs.readFileSync(httpsKey),
          cert: fs.readFileSync(httpsCert),
        },
        app,
      ];

  const server = https.createServer(...serverArgs).listen(port);

  return { app, server };
}
