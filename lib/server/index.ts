import { log as logger } from '../logs/logger';
import { bindSocketToWebserver } from './socket';
import { forwardHttpRequest } from '../common/relay';
import version from '../common/utils/version';
import { applyPrometheusMiddleware } from './utils/prometheus-middleware';
import { validateBrokerTypeMiddleware } from './broker-middleware';
import { webserver } from '../common/http/webserver';
import { serverStarting, serverStopping } from './infra/dispatcher';
import { handlePostResponse } from './routesHandlers/postResponseHandler';
import { connectionStatusHandler } from './routesHandlers/connectionStatusHandler';
import { ServerOpts } from './types/http';
import { overloadHttpRequestWithConnectionDetailsMiddleware } from './routesHandlers/httpRequestHandler';

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
  const { io } = bindSocketToWebserver(server, serverOpts);

  if (!process.env.JEST_WORKER_ID) {
    app.use(applyPrometheusMiddleware());
  }
  app.get('/connection-status/:token', connectionStatusHandler);

  app.all(
    '/broker/:token/*',
    overloadHttpRequestWithConnectionDetailsMiddleware,
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
