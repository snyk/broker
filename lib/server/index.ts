import { log as logger } from '../logs/logger';
import { bindSocketToWebserver } from './socket';
import version from '../common/utils/version';
import { applyPrometheusMiddleware } from './utils/prometheus-middleware';
import { validateBrokerTypeMiddleware } from './broker-middleware';
import { webserver } from '../common/http/webserver';
import { serverStarting, serverStopping } from './infra/dispatcher';
import { handlePostResponse } from './routesHandlers/postResponseHandler';
import { connectionStatusHandler } from './routesHandlers/connectionStatusHandler';
import { ServerOpts } from '../common/types/options';
import { overloadHttpRequestWithConnectionDetailsMiddleware } from './routesHandlers/httpRequestHandler';
import { getForwardHttpRequestHandler } from './socketHandlers/initHandlers';
import { loadAllFilters } from '../common/filter/filtersAsync';
import { FiltersType } from '../common/types/filter';
import filterRulesLoader from '../common/filter/filter-rules-loading';
import { authRefreshHandler } from './routesHandlers/authHandlers';
import { disconnectConnectionsWithStaleCreds } from './auth/connectionWatchdog';

export const main = async (serverOpts: ServerOpts) => {
  logger.info({ version }, 'Broker starting in server mode');

  const filters = await filterRulesLoader(serverOpts.config);
  if (!filters) {
    const error = new ReferenceError(
      `Server mode - No Filters found. A Broker requires filters to run. Review config.default.json or ACCEPT env var. Shutting down.`,
    );
    error['code'] = 'MISSING_FILTERS';
    logger.error({ error }, error.message);
    throw error;
  }
  const classicFilters: FiltersType = filters as FiltersType;

  // start the local webserver to listen for relay requests
  const { app, server } = webserver(serverOpts.config, serverOpts.port);

  const loadedServerOpts = {
    loadedFilters: loadAllFilters(classicFilters, serverOpts.config),
    ...serverOpts,
  };
  if (!loadedServerOpts.loadedFilters) {
    logger.error({ serverOpts }, 'Unable to load filters');
    throw new Error('Unable to load filters');
  }

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
  const { websocket } = bindSocketToWebserver(server, loadedServerOpts);

  if (!process.env.JEST_WORKER_ID) {
    app.use(applyPrometheusMiddleware());
  }
  app.get('/connection-status/:token', connectionStatusHandler);
  app.all(
    '/broker/:token/*',
    overloadHttpRequestWithConnectionDetailsMiddleware,
    validateBrokerTypeMiddleware,
    getForwardHttpRequestHandler(),
  );

  if (loadedServerOpts.config.BROKER_SERVER_MANDATORY_AUTH_ENABLED) {
    app.post(
      '/hidden/brokers/connections/:identifier/auth/refresh',
      authRefreshHandler,
    );
    app.post(
      '/hidden/broker/response-data/:brokerToken/:streamingId',
      handlePostResponse,
    );

    setInterval(
      disconnectConnectionsWithStaleCreds,
      loadedServerOpts.config.STALE_CONNECTIONS_CLEANUP_FREQUENCY ??
        10 * 60 * 1000,
    );
  } else {
    app.post('/response-data/:brokerToken/:streamingId', handlePostResponse);
  }

  app.get('/', (req, res) => res.status(200).json({ ok: true, version }));

  app.get('/healthcheck', (req, res) =>
    res.status(200).json({ ok: true, version }),
  );

  return {
    websocket: websocket,
    close: (done) => {
      logger.info('server websocket is closing');
      server.close();
      websocket.destroy(function () {
        logger.info('server websocket is closed');
        if (done) {
          return done();
        }
      });
    },
  };
};
