import express from 'express';
import bodyParser from 'body-parser';
import fs from 'fs';
import { log as logger } from '../../logs/logger';
import {
  maskToken,
  hashToken,
  extractBrokerTokenFromUrl,
} from '../utils/token';
import { createServer as createHttpServer } from 'http';
import { createServer as createHttpsServer } from 'https';

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

export const webserver = (config, altPort: number) => {
  let { httpsKey = null, httpsCert = null, port = 7341 } = config; // eslint-disable-line prefer-const
  const isHttp = !httpsKey && !httpsCert; // no https if there's no certs

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
      const hashedToken = hashToken(brokerToken);
      logger.error(
        {
          url: req.url.replaceAll(brokerToken, maskedToken),
          requestMethod: req.method,
          requestHeaders: req.headers,
          requestId: req.headers['snyk-request-id'] || '',
          maskedToken: maskedToken,
          hashedToken: hashedToken,
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

  const server = isHttp
    ? createHttpServer(app).listen(port)
    : createHttpsServer(
        {
          key: fs.readFileSync(httpsKey),
          cert: fs.readFileSync(httpsCert),
        },
        app,
      ).listen(port);

  return { app, server };
};
