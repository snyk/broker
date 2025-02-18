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
import { isWebsocketConnOpen } from './utils/socketHelpers';
import { ClientOpts } from '../common/types/options';
import { websocketConnectionSelectorMiddleware } from './routesHandler/websocketConnectionMiddlewares';
import { getClientConfigMetadata } from './config/configHelpers';
import { loadPlugins } from './brokerClientPlugins/pluginManager';
import { manageWebsocketConnections } from './connectionsManager/manager';
import { findPluginFolder } from '../common/config/config';
import { retrieveAndLoadFilters } from './utils/filterLoading';

const ONEDAY = 24 * 3600 * 1000; // 24h in ms

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
    clientOpts.config.brokerClientId = uuidv4();
    clientOpts.config.logEnableBody = 'false';
    clientOpts.config.LOG_ENABLE_BODY = 'false';
    logger.info(
      { brokerClientId: clientOpts.config.brokerClientId },
      'generated broker client id',
    );

    clientOpts.config.API_BASE_URL =
      clientOpts.config.API_BASE_URL ??
      clientOpts.config.BROKER_DISPATCHER_BASE_URL ??
      clientOpts.config.BROKER_SERVER_URL?.replace(
        '//broker.',
        '//api.',
      ).replace('//broker2.', '//api.') ??
      'https://api.snyk.io';

    clientOpts.config.apiHostname = clientOpts.config.API_BASE_URL;

    if (
      clientOpts.config.universalBrokerEnabled &&
      clientOpts.config.UNIVERSAL_BROKER_GA
    ) {
      process.env.SNYK_DISPATCHER_URL_PREFIX = '/hidden/brokers';
    }
    await validateMinimalConfig(clientOpts);

    if (clientOpts.config.universalBrokerEnabled) {
      const pluginsFolderPath = await findPluginFolder(
        __dirname ?? process.cwd(),
        'brokerClientPlugins',
      );
      if (!pluginsFolderPath) {
        throw new Error('Unable to load plugins - plugins folder not found.');
      }

      clientOpts.config.plugins = await loadPlugins(
        `${pluginsFolderPath}/plugins`,
        clientOpts,
      );
    } else {
      // universal broker logic is in connection manager
      hookResults = await processStartUpHooks(
        clientOpts,
        clientOpts.config.brokerClientId,
      );
    }
    await retrieveAndLoadFilters(clientOpts);
    if (process.env.NODE_ENV != 'test') {
      setInterval(async () => {
        await retrieveAndLoadFilters(clientOpts);
      }, ONEDAY);
    }
    const globalIdentifyingMetadata: IdentifyingMetadata = {
      capabilities: ['post-streams'],
      clientId: clientOpts.config.brokerClientId,
      filters: clientOpts.filters ?? new Map(),
      preflightChecks: hookResults.preflightCheckResults,
      version,
      clientConfig: getClientConfigMetadata(clientOpts.config),
      role: Role.primary,
      id: '',
      isDisabled: false,
    };

    let websocketConnections: WebSocketConnection[] = [];
    if (clientOpts.config.universalBrokerEnabled) {
      websocketConnections = await manageWebsocketConnections(
        clientOpts,
        globalIdentifyingMetadata,
      );
    } else {
      websocketConnections.push(
        createWebSocket(clientOpts, globalIdentifyingMetadata, Role.primary),
      );
      websocketConnections.push(
        createWebSocket(clientOpts, globalIdentifyingMetadata, Role.secondary),
      );
    }

    // start the local webserver to listen for relay requests
    const { app, server } = webserver(clientOpts.config, clientOpts.port);
    const httpToWsForwarder = forwardHttpRequest(clientOpts);
    const httpToAPIForwarder = forwardHttpRequest(clientOpts, true);
    // IMPORTANT: defined before relay (`app.all('/*', ...`)
    app.get('/health/checks', handleChecksRoute(clientOpts.config));
    app.get('/health/checks/:checkId', handleCheckIdsRoutes(clientOpts.config));

    app.get(
      clientOpts.config.brokerHealthcheckPath || '/healthcheck',
      (req, res, next) => {
        res.locals.websocketConnections = websocketConnections;
        next();
      },
      healthCheckHandler,
    );

    app.get('/filters', (req, res) => {
      res.send(clientOpts.filters);
    });
    app.post('/filters', async (req, res) => {
      await retrieveAndLoadFilters(clientOpts);
      res.send(clientOpts.filters);
    });

    app.get(
      clientOpts.config.brokerSystemcheckPath || '/systemcheck',
      (req, res, next) => {
        res.locals.clientOpts = clientOpts;
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
    throw err;
  }
};
