import { v4 as uuidv4 } from 'uuid';
import { createWebSocket } from './socket';
import { log as logger } from '../logs/logger';
import { forwardHttpRequest } from '../common/relay/forwardHttpRequest';
import { webserver } from '../common/http/webserver';
import version from '../common/utils/version';
import {
  handleChecksRoute,
  handleCheckIdsRoutes,
} from './checks/api/checks-handler';
import { healthCheckHandler } from './routesHandler/healthcheckHandler';
import { systemCheckHandler } from './routesHandler/systemCheckHandler';
import {
  HookResults,
  IdentifyingMetadata,
  Role,
  WebSocketConnection,
} from './types/client';
import {
  processStartUpHooks,
  validateMinimalConfig,
} from './hooks/startup/processHooks';
import { forwardHttpRequestOverHttp } from '../common/relay/forwardHttpRequestOverHttp';
import { isWebsocketConnOpen } from './utils/socketHelpers';
import { loadAllFilters } from '../common/filter/filtersAsync';
import { ClientOpts, LoadedClientOpts } from '../common/types/options';
import { websocketConnectionSelectorMiddleware } from './routesHandler/websocketConnectionMiddlewares';
import { getClientConfigMetadata } from './config/configHelpers';
import { findProjectRoot } from '../common/config/config';
import { loadPlugins } from './brokerClientPlugins/pluginManager';
import { manageWebsocketConnections } from './connectionsManager/manager';

process.on('uncaughtException', (error) => {
  if (error.message == 'read ECONNRESET') {
    logger.error(
      { msg: error.message, stackTrace: error.stack },
      'ECONNRESETs Catch all:',
      error.message,
    );
  } else {
    logger.error(
      { msg: error.message, stackTrace: error.stack },
      'Uncaught exception:',
      error.message,
    );
    process.exit(1);
  }
});

export const main = async (clientOpts: ClientOpts) => {
  try {
    logger.info({ version }, 'Broker starting in client mode');
    let hookResults: HookResults = {};
    const brokerClientId = uuidv4();
    logger.info({ brokerClientId }, 'generated broker client id');

    clientOpts.config.API_BASE_URL =
      clientOpts.config.API_BASE_URL ??
      clientOpts.config.BROKER_DISPATCHER_BASE_URL ??
      clientOpts.config.BROKER_SERVER_URL?.replace(
        '//broker.',
        '//api.',
      ).replace('//broker2.', '//api.') ??
      'https://api.snyk.io';

    await validateMinimalConfig(clientOpts);
    if (clientOpts.config.universalBrokerEnabled) {
      const pluginsFolderPath = `${findProjectRoot(
        __dirname,
      )}/dist/lib/client/brokerClientPlugins/plugins`;
      clientOpts.config.plugins = await loadPlugins(
        pluginsFolderPath,
        clientOpts,
      );
    } else {
      // universal broker logic is in connection manager
      hookResults = await processStartUpHooks(clientOpts, brokerClientId);
    }

    const loadedClientOpts: LoadedClientOpts = {
      loadedFilters: loadAllFilters(clientOpts.filters, clientOpts.config),
      ...clientOpts,
    };

    if (!loadedClientOpts.loadedFilters) {
      logger.error({ clientOpts }, 'Unable to load filters');
      throw new Error('Unable to load filters');
    }

    const globalIdentifyingMetadata: IdentifyingMetadata = {
      capabilities: ['post-streams'],
      clientId: brokerClientId,
      filters: loadedClientOpts.filters,
      preflightChecks: hookResults.preflightCheckResults,
      version,
      clientConfig: getClientConfigMetadata(clientOpts.config),
      role: Role.primary,
      id: '',
      isDisabled: false,
    };

    let websocketConnections: WebSocketConnection[] = [];
    if (loadedClientOpts.config.universalBrokerEnabled) {
      websocketConnections = await manageWebsocketConnections(
        loadedClientOpts,
        globalIdentifyingMetadata,
      );
    } else {
      websocketConnections.push(
        createWebSocket(
          loadedClientOpts,
          globalIdentifyingMetadata,
          Role.primary,
        ),
      );
      websocketConnections.push(
        createWebSocket(
          loadedClientOpts,
          globalIdentifyingMetadata,
          Role.secondary,
        ),
      );
    }

    // start the local webserver to listen for relay requests
    const { app, server } = webserver(
      loadedClientOpts.config,
      loadedClientOpts.port,
    );

    const httpToWsForwarder = forwardHttpRequest(loadedClientOpts);
    const httpToAPIForwarder = forwardHttpRequestOverHttp(
      loadedClientOpts,
      loadedClientOpts.config,
    );
    // IMPORTANT: defined before relay (`app.all('/*', ...`)
    app.get('/health/checks', handleChecksRoute(loadedClientOpts.config));
    app.get(
      '/health/checks/:checkId',
      handleCheckIdsRoutes(loadedClientOpts.config),
    );

    app.get(
      loadedClientOpts.config.brokerHealthcheckPath || '/healthcheck',
      (req, res, next) => {
        res.locals.websocketConnections = websocketConnections;
        next();
      },
      healthCheckHandler,
    );

    app.get('/filters', (req, res) => {
      res.send(loadedClientOpts.filters);
    });

    app.get(
      loadedClientOpts.config.brokerSystemcheckPath || '/systemcheck',
      (req, res, next) => {
        res.locals.clientOpts = loadedClientOpts;
        next();
      },
      systemCheckHandler,
    );

    app.post(
      '/webhook/*',
      (req, res, next) => {
        res.locals.websocketConnections = websocketConnections;
        next();
      },
      websocketConnectionSelectorMiddleware,
      (req, res) => {
        if (isWebsocketConnOpen(res.locals.websocket)) {
          httpToWsForwarder(req, res);
        } else {
          logger.warn('Websocket connection closed, forwarding via API');
          httpToAPIForwarder(req, res);
        }
      },
    );
    // relay all other URL paths
    app.all(
      '/*',
      (req, res, next) => {
        // Middleware checks the request url for /webhook/scmType/ID, and from the scmType pick the relevant filter.
        // Need to check what CRA agent requests look like so we don't mess that up.
        // New hooks we want to inject the BROKER_CLIENT_URL with the integration ID so we can select based on the integration ID
        // but doing so can't break the existing webhooks
        res.locals.websocketConnections = websocketConnections;
        next();
      },
      websocketConnectionSelectorMiddleware,
      httpToWsForwarder,
    );

    return {
      websocketConnections,
      close: (done) => {
        logger.info('client websocket is closing');
        server.close();
        for (let i = 0; i < websocketConnections.length; i++) {
          websocketConnections[i].destroy(function () {
            logger.info(
              `client websocket ${
                websocketConnections[i].identifier || ''
              } is closed`,
            );
            if (done) {
              return done();
            }
          });
        }
      },
    };
  } catch (err) {
    logger.warn({ err }, `Shutting down client`);
    // throw err;
  }
};
