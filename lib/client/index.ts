import { v4 as uuidv4 } from 'uuid';
import { createWebSocket, createWebSockets } from './socket';
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
import { IdentifyingMetadata, WebSocketConnection } from './types/client';
import { processStartUpHooks } from './hooks/startup/processHooks';
import { loadAllFilters } from '../common/filter/filtersAsync';
import { ClientOpts, LoadedClientOpts } from '../common/types/options';
import { websocketConnectionSelectorMiddleware } from './routesHandler/websocketConnectionMiddlewares';

export const main = async (clientOpts: ClientOpts) => {
  try {
    logger.info({ version }, 'running in client mode');
    const brokerClientId = uuidv4();
    logger.info({ brokerClientId }, 'generated broker client id');
    const hookResults = await processStartUpHooks(clientOpts, brokerClientId);
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
      filters: clientOpts.filters,
      preflightChecks: hookResults.preflightCheckResults,
      version,
    };
    let websocketConnections: WebSocketConnection[] = [];
    if (clientOpts.config.universalBrokerEnabled) {
      websocketConnections = createWebSockets(
        loadedClientOpts,
        globalIdentifyingMetadata,
      );
    } else {
      websocketConnections.push(
        createWebSocket(loadedClientOpts, globalIdentifyingMetadata),
      );
    }
    // start the local webserver to listen for relay requests
    const { app, server } = webserver(clientOpts.config, clientOpts.port);

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
      res.send(loadedClientOpts.filters);
    });

    app.get(
      clientOpts.config.brokerSystemcheckPath || '/systemcheck',
      (req, res, next) => {
        res.locals.clientOpts = loadedClientOpts;
        next();
      },
      // websocketConnectionSelectorMiddleware,
      systemCheckHandler,
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
      forwardHttpRequest(loadedClientOpts),
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
