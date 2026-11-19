import express from 'express';
import bodyParser from 'body-parser';
import fs from 'fs';
import { log as logger } from '../../../logs/logger';
import { setRequestIdHeader } from './middleware/requestId';
import {
  maskToken,
  hashToken,
  extractBrokerTokenFromUrl,
  safeUrl,
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

// Node defaults to 511; the kernel caps this at net.core.somaxconn.
const DEFAULT_SERVER_LISTEN_BACKLOG = 4096;

// The broker server sits behind a proxy that pools upstream connections.
// Bursts of new connections overflow Node's default listen backlog during
// short event-loop stalls, and the proxy fails them with connect timeouts.
// The larger backlog below only applies to the broker server.
// brokerType is set by lib/index.ts; BROKER_TYPE is kept for compatibility
// (on the client it holds the SCM type, so it can't be relied on).
const isBrokerServer = (config): boolean =>
  config?.brokerType === 'server' || process.env.BROKER_TYPE === 'server';

const positiveIntOrDefault = (value, fallback: number): number => {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const getServerListenBacklog = (config): number =>
  positiveIntOrDefault(
    config?.BROKER_WEBSERVER_LISTEN_BACKLOG,
    DEFAULT_SERVER_LISTEN_BACKLOG,
  );

export const webserver = (config, altPort: number) => {
  let { httpsKey = null, httpsCert = null, port = 7341 } = config; // eslint-disable-line prefer-const
  const isHttp = !httpsKey && !httpsCert; // no https if there's no certs

  const app = express();

  app.disable('x-powered-by');

  app.use(setRequestIdHeader());
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
      const hashedToken = hashToken(brokerToken);
      logger.error(
        {
          url: safeUrl(req.url),
          requestMethod: req.method,
          requestHeaders: req.headers,
          requestId: req.requestId,
          maskedToken: maskToken(brokerToken),
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

  const server = isHttp
    ? createHttpServer(app)
    : createHttpsServer(
        {
          key: fs.readFileSync(httpsKey),
          cert: fs.readFileSync(httpsCert),
        },
        app,
      );
  server.maxHeadersCount = 0; // fix https://security.snyk.io/vuln/SNYK-JS-WS-7266574
  server.requestTimeout = process.env.BROKER_WEBSERVER_REQUEST_TIMEOUT
    ? parseInt(process.env.BROKER_WEBSERVER_REQUEST_TIMEOUT)
    : 600000;
  if (process.env.BROKER_TYPE === 'server') {
    server.keepAliveTimeout =
      config.BROKER_WEBSERVER_KEEPALIVE_TIMEOUT ?? 650000;
  }
  if (isBrokerServer(config)) {
    server.listen({
      port: Number(port),
      backlog: getServerListenBacklog(config),
    });
  } else {
    server.listen(port);
  }
  logger.info(
    { port, requestTimeout: server.requestTimeout },
    'local server is listening.',
  );
  return { app, server };
};
