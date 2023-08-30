import primus from 'primus';
import rp from 'request-promise-native';
const { v4: uuidv4 } = require('uuid');
import socket from './socket';
import { FiltersType } from '../filters';
import { log as logger, sanitise } from '../log';
import { forwardHttpRequest } from '../relay';
import { webserver } from '../webserver';
import version from '../version';
import { getServerId, highAvailabilityModeEnabled } from './dispatcher';
import { executePreflightChecks, preflightChecksEnabled } from './checks';
import {
  handleChecksRoute,
  handleCheckIdsRoutes,
} from './checks/api/checks-handler';
import { commitSigningEnabled, commitSigningFilterRules } from './scm';

interface ClientOpts {
  port: number;
  config: Record<string, any>;
  filters: FiltersType;
}

export const main = async (clientOpts: ClientOpts) => {
  logger.info({ version }, 'running in client mode');

  if (!clientOpts.config.BROKER_CLIENT_URL) {
    const proto =
      !clientOpts.config.key && !clientOpts.config.cert ? 'http' : 'https';
    clientOpts.config.BROKER_CLIENT_URL = `${proto}://localhost:${clientOpts.config.port}`;
  }

  const brokerClientId = uuidv4();
  logger.info({ brokerClientId }, 'generated broker client id');

  let serverId;
  if (highAvailabilityModeEnabled(clientOpts.config)) {
    serverId = await getServerId(clientOpts.config, brokerClientId);

    if (serverId === null) {
      logger.warn({}, 'could not receive server id from Broker Dispatcher');
      serverId = '';
    } else {
      logger.info({ serverId }, 'received server id');
    }
  }

  let preflightCheckResults;
  if (preflightChecksEnabled(clientOpts.config)) {
    // wrap preflight checks execution into try-catch, so the broker client
    // will start anyway
    try {
      preflightCheckResults = await executePreflightChecks(clientOpts.config);
    } catch (error) {
      logger.error({ error }, 'failed to execute preflight checks');
    }
  }

  if (commitSigningEnabled(clientOpts.config)) {
    const commitSigningRules = commitSigningFilterRules();
    clientOpts.filters.private?.push(...commitSigningRules);
    logger.info(
      { enabled: true, rulesCount: commitSigningRules.length },
      'loading commit signing rules',
    );
  }

  const identifyingMetadata = {
    capabilities: ['post-streams'],
    clientId: brokerClientId,
    filters: clientOpts.filters,
    preflightChecks: preflightCheckResults,
    version,
  };

  const io = socket({
    token: clientOpts.config.brokerToken,
    url: clientOpts.config.brokerServerUrl,
    filters: clientOpts.filters?.private,
    config: clientOpts.config,
    identifyingMetadata,
    serverId,
  });

  // start the local webserver to listen for relay requests
  const { app, server } = webserver(clientOpts.config, clientOpts.port);

  // IMPORTANT: defined before relay (`app.all('/*', ...`)
  app.get('/health/checks', handleChecksRoute(clientOpts.config));
  app.get('/health/checks/:checkId', handleCheckIdsRoutes(clientOpts.config));

  app.get(
    clientOpts.config.brokerHealthcheckPath || '/healthcheck',
    (req, res) => {
      // healthcheck state depends on websocket connection status
      // value of primus.Spark.OPEN means the websocket connection is open
      const isConnOpen = io.readyState === primus.Spark.OPEN;
      const status = isConnOpen ? 200 : 500;
      const data = {
        ok: isConnOpen,
        websocketConnectionOpen: isConnOpen,
        brokerServerUrl: io.url.href,
        version,
        transport: io.socket.transport.name,
      };

      return res.status(status).json(data);
    },
  );

  app.get(
    clientOpts.config.brokerSystemcheckPath || '/systemcheck',
    async (req, res) => {
      // Systemcheck is the broker client's ability to assert the network
      // reachability and some correctness of credentials for the service
      // being proxied by the broker client.

      const brokerClientValidationMethod =
        clientOpts.config.brokerClientValidationMethod || 'GET';
      const brokerClientValidationTimeoutMs =
        clientOpts.config.brokerClientValidationTimeoutMs || 5000;
      const isJsonResponse =
        !clientOpts.config.brokerClientValidationJsonDisabled;

      // set auth header according to config
      const { auths, rawCreds } = loadCredentialsFromConfig(clientOpts.config);

      // make the internal validation request
      const validationResults: any = [];
      let errorOccurred = true;
      if (auths.length > 0) {
        for (let i = 0; i < auths.length; i++) {
          logger.info(`Checking if credentials at index ${i} are valid`);
          const auth = auths[i];
          const rawCred = rawCreds[i];
          const { data, errorOccurred: err } = await checkCredentials(
            auth,
            clientOpts.config,
            brokerClientValidationMethod,
            brokerClientValidationTimeoutMs,
            isJsonResponse,
          );
          data['maskedCredentials'] =
            rawCred.length <= 6
              ? '***'
              : `${rawCred.substring(0, 3)}***${rawCred.substring(
                  rawCred.length - 3,
                )}`;
          validationResults.push(data);
          errorOccurred = err;
          logger.info('Credentials checked');
        }
      } else {
        logger.info(
          'No credentials specified - checking if target can be accessed without credentials',
        );
        const { data, errorOccurred: err } = await checkCredentials(
          null,
          clientOpts.config,
          brokerClientValidationMethod,
          brokerClientValidationTimeoutMs,
          isJsonResponse,
        );
        data['maskedCredentials'] = null;
        validationResults.push(data);
        errorOccurred = err;
      }

      if (errorOccurred) {
        return res.status(500).json(validationResults);
      } else {
        return res.status(200).json(validationResults);
      }
    },
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
};

function credsFromHeader(s) {
  if (s.indexOf(' ') >= 0) {
    return s.substring(s.indexOf(' ') + 1);
  } else {
    return s;
  }
}

function loadCredentialsFromConfig(config) {
  let auths: any = [];
  let rawCreds: any = [];
  if (config.brokerClientValidationAuthorizationHeaderPool) {
    auths = config.brokerClientValidationAuthorizationHeaderPool;
    rawCreds =
      config.brokerClientValidationAuthorizationHeaderPool.map(credsFromHeader);
  } else if (config.brokerClientValidationBasicAuthPool) {
    auths = config.brokerClientValidationBasicAuthPool.map(
      (s) => `Basic ${Buffer.from(s).toString('base64')}`,
    );
    rawCreds = config.brokerClientValidationBasicAuthPool;
  } else if (config.brokerClientValidationAuthorizationHeader) {
    auths.push(config.brokerClientValidationAuthorizationHeader);
    rawCreds.push(config.brokerClientValidationAuthorizationHeader);
    rawCreds = rawCreds.map(credsFromHeader);
  } else if (config.brokerClientValidationBasicAuth) {
    auths.push(
      `Basic ${Buffer.from(config.brokerClientValidationBasicAuth).toString(
        'base64',
      )}`,
    );
    rawCreds.push(config.brokerClientValidationBasicAuth);
  }
  return { auths, rawCreds };
}

async function checkCredentials(
  auth,
  config,
  brokerClientValidationMethod,
  brokerClientValidationTimeoutMs,
  isJsonResponse,
) {
  const data = {
    brokerClientValidationUrl: sanitise(config.brokerClientValidationUrl),
    brokerClientValidationMethod,
    brokerClientValidationTimeoutMs,
  };

  const validationRequestHeaders = {
    'user-agent': 'Snyk Broker client ' + version,
  };
  if (auth) {
    validationRequestHeaders['authorization'] = auth;
  }

  let errorOccurred = true;
  // This was originally `request`, but `await` is a lot easier to understand than nested callback hell.
  await rp({
    url: config.brokerClientValidationUrl,
    headers: validationRequestHeaders,
    method: brokerClientValidationMethod,
    timeout: brokerClientValidationTimeoutMs,
    json: isJsonResponse,
    resolveWithFullResponse: true,
    agentOptions: {
      ca: config.caCert, // Optional CA cert
    },
  })
    .then((response) => {
      // test logic requires to surface internal data
      // which is best not exposed in production
      if (process.env.JEST_WORKER_ID) {
        data['testResponse'] = response;
      }

      const responseStatusCode = response && response.statusCode;
      data['brokerClientValidationUrlStatusCode'] = responseStatusCode;

      // check for 2xx status code
      const goodStatusCode = /^2/.test(responseStatusCode);
      if (!goodStatusCode) {
        data['ok'] = false;
        data['error'] =
          responseStatusCode === 401 || responseStatusCode === 403
            ? 'Failed due to invalid credentials'
            : 'Status code is not 2xx';

        logger.error(data, response && response.body, 'Systemcheck failed');
        return;
      }

      errorOccurred = false;
      data['ok'] = true;
    })
    .catch((error) => {
      // test logic requires to surface internal data
      // which is best not exposed in production
      if (process.env.JEST_WORKER_ID) {
        data['testError'] = error;
      }

      data['ok'] = false;
      data['error'] = error.message;
    });

  return { data, errorOccurred };
}
