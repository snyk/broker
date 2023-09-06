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
import { ClientOpts } from './types/client';
import { processStartUpHooks } from './hooks/startup/processHooks';

export const main = async (clientOpts: ClientOpts) => {
  try {
    logger.info({ version }, 'running in client mode');

    const brokerClientId = uuidv4();
    logger.info({ brokerClientId }, 'generated broker client id');

    const hookResults = await processStartUpHooks(clientOpts, brokerClientId);
    if (!hookResults.okToBoot) {
      throw new Error(
        `Processing startup hooks error. Interrupting broker client boot up.`,
      );
    }
    const identifyingMetadata = {
      capabilities: ['post-streams'],
      clientId: brokerClientId,
      filters: clientOpts.filters,
      preflightChecks: hookResults.preflightCheckResults,
      version,
    };

    // const io = socket({
    //   token: clientOpts.config.brokerToken,
    //   url: clientOpts.config.brokerServerUrl,
    //   filters: clientOpts.filters?.private,
    //   config: clientOpts.config,
    //   identifyingMetadata,
    //   serverId: clientOpts.config.serverId,
    // });
    const io = createWebSocket(clientOpts, identifyingMetadata);

    // start the local webserver to listen for relay requests
    const { app, server } = webserver(clientOpts.config, clientOpts.port);

    // IMPORTANT: defined before relay (`app.all('/*', ...`)
    app.get('/health/checks', handleChecksRoute(clientOpts.config));
    app.get('/health/checks/:checkId', handleCheckIdsRoutes(clientOpts.config));

    app.get(
      clientOpts.config.brokerHealthcheckPath || '/healthcheck',
      (req, res, next) => {
        res.locals.io = io;
        next();
      },
      healthCheckHandler,
    );

    app.get(
      clientOpts.config.brokerSystemcheckPath || '/systemcheck',
      (req, res, next) => {
        res.locals.clientOpts = clientOpts;
        next();
      },
      systemCheckHandler,
    );

    // relay all other URL paths
    app.all(
      '/*',
      (req, res, next) => {
        res.locals.io = io;
        next();
      },
      forwardHttpRequest(clientOpts.filters?.public),
    );

    return {
      io,
      close: (done) => {
        logger.info('client websocket is closing');
        server.close();
        io.destroy(function () {
          logger.info('client websocket is closed');
          if (done) {
            return done();
          }
        });
      },
    };
  } catch (err) {
    logger.warn({ err }, `Shutting down client`);
  }
};
