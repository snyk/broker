import { FiltersType } from '../common/filter/filters';
import { log as logger } from '../logs/logger';
import socket from './socket';
import { forwardHttpRequest } from '../common/relay';
import version from '../common/utils/version';
import { incrementHttpRequestsTotal } from '../common/utils/metrics';
import { applyPrometheusMiddleware } from './utils/prometheus-middleware';
import { validateBrokerTypeMiddleware } from './broker-middleware';
import { webserver } from '../common/http/webserver';
import { serverStarting, serverStopping } from './infra/dispatcher';
import { getDesensitizedToken } from './utils/token';
import { handlePostResponse } from './http/postResponseHandler';
interface ServerOpts {
  port: number;
  config: Record<string, any>;
  filters: FiltersType;
}

export const main = async (serverOpts: ServerOpts) => {
  logger.info({ version }, 'running in server mode');

  // start the local webserver to listen for relay requests
  const { app, server } = webserver(serverOpts.config, serverOpts.port);
  // Requires are done recursively, so this is here to avoid contaminating the Client

  const onSignal = async () => {
    logger.debug('received exit signal, closing server');
    await serverStopping(() => {
      process.exit(0);
    });
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  await serverStarting();

  // bind the socket server to the web server
  const { io, connections } = socket({
    server,
    filters: serverOpts.filters?.private,
    config: serverOpts.config,
  });

  if (!process.env.JEST_WORKER_ID) {
    app.use(applyPrometheusMiddleware());
  }
  app.get('/connection-status/:token', (req, res) => {
    const token = req.params.token;
    const desensitizedToken = getDesensitizedToken(token);
    if (connections.has(token)) {
      const clientsMetadata = connections.get(req.params.token).map((conn) => ({
        version: conn.metadata && conn.metadata.version,
        filters: conn.metadata && conn.metadata.filters,
      }));
      return res.status(200).json({ ok: true, clients: clientsMetadata });
    }
    logger.warn({ desensitizedToken }, 'no matching connection found');
    return res.status(404).json({ ok: false });
  });

  app.all(
    '/broker/:token/*',
    (req, res, next) => {
      const token = req.params.token;
      const desensitizedToken = getDesensitizedToken(token);
      req['maskedToken'] = desensitizedToken.maskedToken;
      req['hashedToken'] = desensitizedToken.hashedToken;

      // check if we have this broker in the connections
      if (!connections.has(token)) {
        incrementHttpRequestsTotal(false);
        logger.warn({ desensitizedToken }, 'no matching connection found');
        return res.status(404).json({ ok: false });
      }

      // Grab a first (newest) client from the pool
      // This is really silly...
      res.locals.io = connections.get(token)[0].socket;
      res.locals.socketVersion = connections.get(token)[0].socketVersion;
      res.locals.capabilities = connections.get(token)[0].metadata.capabilities;
      req['locals'] = {};
      req['locals']['capabilities'] =
        connections.get(token)[0].metadata.capabilities;

      // strip the leading url
      req.url = req.url.slice(`/broker/${token}`.length);
      logger.debug({ url: req.url }, 'request');

      next();
    },
    validateBrokerTypeMiddleware,
    forwardHttpRequest(serverOpts.filters?.public),
  );

  app.post('/response-data/:brokerToken/:streamingId', handlePostResponse);

  app.get('/', (req, res) => res.status(200).json({ ok: true, version }));

  app.get('/healthcheck', (req, res) =>
    res.status(200).json({ ok: true, version }),
  );

  return {
    io,
    close: (done) => {
      logger.info('server websocket is closing');
      server.close();
      io.destroy(function () {
        logger.info('server websocket is closed');
        if (done) {
          return done();
        }
      });
    },
  };
};
