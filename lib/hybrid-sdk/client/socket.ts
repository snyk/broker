// import '../common/http/patch-https-request-for-proxying';

import Primus from 'primus';
import { uuidv4 } from '../common/utils/uuid';
import { log as logger } from '../../logs/logger';
import primusEmitter from 'primus-emitter';
import {
  reconnectFailedHandler,
  reconnectScheduledHandler,
} from './socketHandlers/reconnectHandler';
import { identifyHandler } from './socketHandlers/identifyHandler';
import { createErrorHandler } from './socketHandlers/errorHandler';
import { openHandler } from './socketHandlers/openHandler';
import { closeHandler } from './socketHandlers/closeHandler';
import { IdentifyingMetadata, Role, WebSocketConnection } from './types/client';
import { requestHandler } from './socketHandlers/requestHandler';
import { chunkHandler } from './socketHandlers/chunkHandler';
import { initializeSocketHandlers } from './socketHandlers/init';

import { LoadedClientOpts } from '../common/types/options';
import { maskToken } from '../common/utils/token';
import {
  getAccessToken,
  invalidateToken,
  isOAuthClientInitialized,
} from './auth/oauth';
import { Client, NoopClient } from './metrics';
import { getServerId } from './dispatcher';
import { determineFilterType } from './utils/filterSelection';
import { notificationHandler } from './socketHandlers/notificationHandler';
import { renewBrokerServerConnection } from './auth/brokerServerConnection';
import { AuthRenewalError } from './auth/errors';
import version from '../common/utils/version';
import { addServerIdAndRoleQS } from '../http/utils';
import { serviceHandler } from './socketHandlers/serviceHandler';
import { emitError, emitShutdown } from './events';
import {
  BROKER_ERROR_CODES,
  PROCESS_EXIT_REASONS,
} from '../common/types/telemetry';

const MAX_CONSECUTIVE_AUTH_FAILURES = 3;

// A GA universal client always authenticates.
// SKIP_REMOTE_CONFIG (local-config) mode never initializes OAuth and is exempt.
const clientShouldAuthenticate = (
  config: LoadedClientOpts['config'],
): boolean =>
  Boolean(
    config.universalBrokerEnabled &&
      config.UNIVERSAL_BROKER_GA &&
      !config.SKIP_REMOTE_CONFIG,
  );

/**
 * Creates a pair of WebSocket connections (primary and secondary) for the given connection key.
 * Each logical connection is represented by two sockets so they can be managed as a pair
 * (e.g. by shutDownConnectionPair).
 *
 * @param clientOpts - Loaded client config and options
 * @param globalIdentifyingMetadata - Base identifying metadata (friendlyName, identifier, etc. are set per connection)
 * @param connectionKey - Key into config.connections for this connection
 * @returns The primary and secondary WebSocket connections as a tuple
 * @throws If the connection has no identifier
 */
export const createWebSocketConnectionPairs = async (
  clientOpts: LoadedClientOpts,
  globalIdentifyingMetadata: IdentifyingMetadata,
  connectionKey,
  metricsClient: Client = new NoopClient(),
): Promise<[WebSocketConnection, WebSocketConnection]> => {
  const socketIdentifyingMetadata = structuredClone(globalIdentifyingMetadata);
  socketIdentifyingMetadata.friendlyName = connectionKey;
  socketIdentifyingMetadata.id =
    clientOpts.config.connections[`${connectionKey}`].id ?? '';
  socketIdentifyingMetadata.identifier =
    clientOpts.config.connections[`${connectionKey}`]['identifier'];
  socketIdentifyingMetadata.isDisabled =
    clientOpts.config.connections[`${connectionKey}`].isDisabled ?? false;
  const integrationType =
    clientOpts.config.connections[`${connectionKey}`].type;

  socketIdentifyingMetadata.supportedIntegrationType = determineFilterType(
    integrationType,
    clientOpts.config.connections[`${connectionKey}`],
  );

  if (!socketIdentifyingMetadata.identifier) {
    throw new Error(
      `Cannot create websocket connection ${socketIdentifyingMetadata.friendlyName} without identifier.`,
    );
  }
  let serverId: string | null = null;
  if (clientOpts.config.BROKER_HA_MODE_ENABLED == 'true') {
    serverId = await getServerId(
      clientOpts.config,
      socketIdentifyingMetadata.identifier,
      socketIdentifyingMetadata.clientId,
    );
  }
  if (serverId === null) {
    if (clientOpts.config.BROKER_HA_MODE_ENABLED == 'true') {
      logger.warn({}, 'Could not receive server id from Broker Dispatcher.');
    }
    serverId = '';
  } else {
    logger.info(
      {
        connection: maskToken(socketIdentifyingMetadata.identifier),
        serverId: serverId,
      },
      'Received server id.',
    );
    clientOpts.config.connections[
      `${socketIdentifyingMetadata.friendlyName}`
    ].serverId = serverId;
  }
  socketIdentifyingMetadata.serverId =
    clientOpts.config.connections[`${socketIdentifyingMetadata.friendlyName}`]
      .serverId ?? '';

  // Ensure a token is fetched before constructing sockets so the initial
  // handshake carries an Authorization header regardless of the caller.
  let initialAuthHeader: string | undefined;
  if (clientShouldAuthenticate(clientOpts.config)) {
    initialAuthHeader = await getAccessToken();
  }

  return [
    createWebSocket(
      clientOpts,
      socketIdentifyingMetadata,
      Role.primary,
      metricsClient,
      initialAuthHeader,
    ),
    createWebSocket(
      clientOpts,
      socketIdentifyingMetadata,
      Role.secondary,
      metricsClient,
      initialAuthHeader,
    ),
  ];
};

export const createWebSocket = (
  clientOpts: LoadedClientOpts,
  originalIdentifyingMetadata: IdentifyingMetadata,
  role?: Role,
  metricsClient: Client = new NoopClient(),
  initialAuthHeader?: string,
): WebSocketConnection => {
  const identifyingMetadata = Object.assign({}, originalIdentifyingMetadata);
  identifyingMetadata.role = role ?? Role.primary;
  const localClientOps = Object.assign({}, clientOpts);
  identifyingMetadata.identifier =
    identifyingMetadata.identifier ?? localClientOps.config.brokerToken;
  if (!identifyingMetadata.identifier) {
    throw new Error(
      `Invalid Broker identifier in websocket tunnel creation step.`,
    );
  }

  // Missing OAuth for an authenticating client is fatal rather than a silent
  // downgrade to an unauthenticated (legacy-routed) connection.
  const shouldAuthenticate = clientShouldAuthenticate(clientOpts.config);
  if (shouldAuthenticate && !isOAuthClientInitialized()) {
    logger.fatal(
      { connection: maskToken(identifyingMetadata.identifier) },
      'UNIVERSAL_BROKER_GA is enabled but the OAuth client is not initialized; cannot authenticate.',
    );
    throw new Error(
      'UNIVERSAL_BROKER_GA is enabled but the OAuth client is not initialized.',
    );
  }

  const Socket = Primus.createSocket({
    transformer: 'engine.io',
    parser: 'EJSON',
    plugin: {
      emitter: primusEmitter,
    },
    pathname: clientOpts.config.universalBrokerEnabled
      ? `/primus/${identifyingMetadata.identifier}`
      : `/primus/${localClientOps.config.brokerToken}`,
  });

  let urlWithServerIdAndRole = new URL(localClientOps.config.brokerServerUrl);
  const serverId =
    localClientOps.config.serverId ?? identifyingMetadata.serverId;
  urlWithServerIdAndRole = addServerIdAndRoleQS(
    urlWithServerIdAndRole,
    serverId,
    role ?? Role.primary,
  );

  localClientOps.config.brokerServerUrlForSocket =
    urlWithServerIdAndRole.toString();

  // Will exponentially back-off from 0.5 seconds to a maximum of 20 minutes
  // Retry for a total period of around 4.5 hours
  const socketSettings = {
    reconnect: {
      factor: 1.5,
      retries: 30,
      max: 20 * 60 * 1000,
    },
    ping: parseInt(localClientOps.config.socketPingInterval) || 25000,
    pong: parseInt(localClientOps.config.socketPongTimeout) || 10000,
    timeout: parseInt(localClientOps.config.socketConnectTimeout) || 10000,
  };

  let currentRequestId = uuidv4();
  // Last-known-good auth header. Seeded before the first handshake and refreshed
  // by the renewal timer and the error handler, so header building stays
  // synchronous and never drops to unauthenticated for an authenticating client.
  let lastAuthHeader = initialAuthHeader;
  const buildExtraHeaders = (requestId: string): Record<string, string> => {
    const headers: Record<string, string> = {
      'x-snyk-broker-client-id': identifyingMetadata.clientId,
      'x-snyk-broker-client-role': identifyingMetadata.role,
      'x-broker-client-version': version,
      'snyk-request-id': requestId,
    };
    if (shouldAuthenticate && lastAuthHeader) {
      headers.Authorization = lastAuthHeader;
    }
    return headers;
  };
  socketSettings['transport'] = {
    extraHeaders: buildExtraHeaders(currentRequestId),
  };
  const websocket = new Socket(
    localClientOps.config.brokerServerUrlForSocket,
    socketSettings,
  ) as unknown as WebSocketConnection;
  websocket.socketVersion = 1;
  websocket.socketType = 'client';
  if (localClientOps.config.universalBrokerEnabled) {
    websocket.identifier = identifyingMetadata.identifier;
    websocket.supportedIntegrationType =
      identifyingMetadata.supportedIntegrationType || '';
    websocket.friendlyName = identifyingMetadata.friendlyName || '';
  } else {
    websocket.identifier = maskToken(identifyingMetadata.identifier);
  }
  websocket.serverId = serverId || '';
  websocket.clientConfig = identifyingMetadata.clientConfig;
  websocket.role = identifyingMetadata.role;

  if (shouldAuthenticate) {
    // The access token is not sent when making requests over the websocket, so we must re-validate
    // the token periodically to keep the connection alive. Connections that do not re-validate the
    // access token will be marked as stale and closed by the server.
    const renewalIntervalMs =
      clientOpts.config.AUTH_EXPIRATION_OVERRIDE ?? 10 * 60 * 1000;
    let consecutiveAuthFailures = 0;

    const timeoutHandler = async () => {
      const commonLogFields = {
        connection: maskToken(identifyingMetadata.identifier),
        role: identifyingMetadata.role,
      };

      try {
        const renewOnce = async () => {
          lastAuthHeader = await getAccessToken();
          return renewBrokerServerConnection(
            {
              connectionIdentifier: identifyingMetadata.identifier!,
              brokerClientId: identifyingMetadata.clientId,
              authorization: lastAuthHeader,
              role: identifyingMetadata.role,
              serverId: serverId,
            },
            clientOpts.config,
          );
        };

        logger.debug(commonLogFields, 'Renewing auth.');
        let renewResponse = await renewOnce();

        if (renewResponse.statusCode === 401) {
          logger.debug(
            commonLogFields,
            'Auth renewal returned 401; invalidating cached token and retrying once.',
          );
          invalidateToken();
          renewResponse = await renewOnce();
        }

        const statusCode = renewResponse.statusCode ?? 0;
        const statusClass = Math.floor(statusCode / 100);
        if (statusClass !== 2) {
          throw new AuthRenewalError(statusCode);
        }

        consecutiveAuthFailures = 0;
        logger.debug(commonLogFields, 'Auth renewed.');
        // Rebuild extraHeaders so the next reconnect uses the token just
        // refreshed into lastAuthHeader (including via the 401-retry path).
        websocket.transport.extraHeaders = buildExtraHeaders(currentRequestId);
      } catch (err) {
        const statusCode = err instanceof AuthRenewalError ? err.statusCode : 0;
        const errField = err instanceof AuthRenewalError ? undefined : err;
        // Drop the token so the next attempt refreshes rather than reusing the rejected one.
        invalidateToken();
        consecutiveAuthFailures++;
        metricsClient.recordAuthRenewalFailure(statusCode);

        if (consecutiveAuthFailures >= MAX_CONSECUTIVE_AUTH_FAILURES) {
          logger.fatal(
            { ...commonLogFields, responseCode: statusCode, err: errField },
            `Failed to renew connection ${consecutiveAuthFailures} consecutive times. Exiting...`,
          );
          metricsClient.recordProcessExit(
            PROCESS_EXIT_REASONS.OAUTH_TOKEN_UNAVAILABLE,
          );
          emitShutdown({
            reason: PROCESS_EXIT_REASONS.OAUTH_TOKEN_UNAVAILABLE,
            uptimeSeconds: Math.round(process.uptime()),
          });
          await metricsClient.forceFlush().catch((flushErr) => {
            logger.warn(
              { ...commonLogFields, err: flushErr },
              'Failed to flush metrics before exit',
            );
          });
          process.exit(1);
          return;
        }

        logger.warn(
          {
            ...commonLogFields,
            responseCode: statusCode,
            consecutiveAuthFailures,
            err: errField,
          },
          'Failed to renew connection.',
        );
        emitError({ errorCode: BROKER_ERROR_CODES.AUTH_RENEWAL_FAILED });
      } finally {
        websocket.timeoutHandlerId = setTimeout(
          timeoutHandler,
          renewalIntervalMs,
        );
      }
    };

    websocket.timeoutHandlerId = setTimeout(timeoutHandler, renewalIntervalMs);
  }

  websocket.on('incoming::error', (e) => {
    websocket.emit('error', { type: e.type, description: e.description });
  });

  logger.info(
    {
      url: localClientOps.config.brokerServerUrlForSocket,
      serverId: serverId,
      requestId: currentRequestId,
    },
    `Broker client is connecting to broker server ${role}.`,
  );
  initializeSocketHandlers(websocket, localClientOps);

  // Websocket events
  websocket.on('identify', (serverData) =>
    identifyHandler(serverData, websocket),
  );

  websocket.on('reconnect scheduled', (opts) => {
    metricsClient.setConnectionState('reconnecting', identifyingMetadata.role);
    metricsClient.recordReconnect();

    currentRequestId = uuidv4();
    websocket.transport.extraHeaders = buildExtraHeaders(currentRequestId);
    reconnectScheduledHandler(opts, currentRequestId);
  });

  websocket.on('reconnect failed', () => {
    metricsClient.setConnectionState('failed', identifyingMetadata.role);
    // No client-shutdown event here: 'close' already fired and cleared the
    // event socket, and the transport is permanently down — the event could
    // never be delivered. The reason is still observable via the
    // process_exit metric, which flushes over the OTLP channel, not the WS.
    metricsClient.recordProcessExit(PROCESS_EXIT_REASONS.RECONNECT_EXHAUSTION);
    metricsClient.forceFlush().catch((err) => {
      logger.warn({ err }, 'Failed to flush metrics before exit');
    });
    reconnectFailedHandler(websocket);
  });

  websocket.on(
    'chunk',
    chunkHandler(
      localClientOps.config.universalBrokerEnabled
        ? identifyingMetadata.identifier
        : localClientOps.config.brokerToken,
    ),
  );
  // prealably initialized
  websocket.on(
    'request',
    requestHandler(
      localClientOps.config.universalBrokerEnabled
        ? identifyingMetadata.identifier
        : localClientOps.config.brokerToken,
    ),
  );
  websocket.on('notification', notificationHandler);
  websocket.on(
    'error',
    createErrorHandler(websocket, localClientOps, identifyingMetadata),
  );
  if (shouldAuthenticate) {
    // Refresh the sticky auth header on a connection error so the next backoff
    // reconnect carries a fresh token; the current header is retained meanwhile.
    websocket.on('error', () => {
      void getAccessToken()
        .then((header) => {
          lastAuthHeader = header;
        })
        .catch(() => {
          /* failure already logged/recorded in the oauth layer */
        });
    });
  }

  websocket.on('open', () =>
    openHandler(websocket, localClientOps, identifyingMetadata, metricsClient),
  );

  websocket.on('service', serviceHandler);

  websocket.on('incoming::pong', (time: number) => {
    metricsClient.recordPingLatency((Date.now() - time) / 1000);
  });

  websocket.on('close', () => {
    closeHandler(websocket, localClientOps, identifyingMetadata, metricsClient);
  });

  return websocket;
};
