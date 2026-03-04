// import '../common/http/patch-https-request-for-proxying';

import Primus from 'primus';
import { log as logger } from '../../logs/logger';
import primusEmitter from 'primus-emitter';
import {
  reconnectFailedHandler,
  reconnectScheduledHandler,
} from './socketHandlers/reconnectHandler';
import { identifyHandler } from './socketHandlers/identifyHandler';
import { errorHandler } from './socketHandlers/errorHandler';
import { openHandler } from './socketHandlers/openHandler';
import { closeHandler } from './socketHandlers/closeHandler';
import { IdentifyingMetadata, Role, WebSocketConnection } from './types/client';
import { requestHandler } from './socketHandlers/requestHandler';
import { chunkHandler } from './socketHandlers/chunkHandler';
import { initializeSocketHandlers } from './socketHandlers/init';

import { CONFIGURATION, LoadedClientOpts } from '../common/types/options';
import { maskToken } from '../common/utils/token';
import { getAuthConfig } from './auth/oauth';
import { getServerId } from './dispatcher';
import { determineFilterType } from './utils/filterSelection';
import { notificationHandler } from './socketHandlers/notificationHandler';
import { renewBrokerServerConnection } from './auth/brokerServerConnection';
import version from '../common/utils/version';
import { addServerIdAndRoleQS } from '../http/utils';
import { serviceHandler } from './socketHandlers/serviceHandler';

const getAuthExpirationTimeout = (config: CONFIGURATION) => {
  return (
    config.AUTH_EXPIRATION_OVERRIDE ??
    (getAuthConfig().accessToken?.expiresIn - 60) * 1000
  );
};

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

  return [
    createWebSocket(clientOpts, socketIdentifyingMetadata, Role.primary),
    createWebSocket(clientOpts, socketIdentifyingMetadata, Role.secondary),
  ];
};

export const createWebSocket = (
  clientOpts: LoadedClientOpts,
  originalIdentifyingMetadata: IdentifyingMetadata,
  role?: Role,
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
  if (getAuthConfig().accessToken && clientOpts.config.UNIVERSAL_BROKER_GA) {
    socketSettings['transport'] = {
      extraHeaders: {
        Authorization: getAuthConfig().accessToken.authHeader,
        'x-snyk-broker-client-id': identifyingMetadata.clientId,
        'x-snyk-broker-client-role': identifyingMetadata.role,
        'x-broker-client-version': version,
      },
    };
  }
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

  if (getAuthConfig().accessToken && clientOpts.config.UNIVERSAL_BROKER_GA) {
    // The access token is not sent when making requests over the websocket, so we must re-validate
    // the token periodically to keep the connection alive. Connections that do not re-validate the
    // access token will be marked as stale and closed by the server.
    const timeoutHandler = async () => {
      const commonLogFields = {
        connection: maskToken(identifyingMetadata.identifier),
        role: identifyingMetadata.role,
      };

      websocket.transport.extraHeaders = {
        Authorization: getAuthConfig().accessToken.authHeader,
        'x-snyk-broker-client-id': identifyingMetadata.clientId,
        'x-snyk-broker-client-role': identifyingMetadata.role,
        'x-broker-client-version': version,
      };

      logger.debug(commonLogFields, 'Renewing auth.');
      const renewResponse = await renewBrokerServerConnection(
        {
          connectionIdentifier: identifyingMetadata.identifier!,
          brokerClientId: identifyingMetadata.clientId,
          authorization: getAuthConfig().accessToken.authHeader,
          role: identifyingMetadata.role,
          serverId: serverId,
        },
        clientOpts.config,
      );

      const statusClass = Math.floor((renewResponse.statusCode ?? 0) / 100);
      switch (statusClass) {
        case 2: // 2XX - success
          logger.debug(commonLogFields, 'Auth renewed.');
          break;
        case 4: // 4XX - client error - unrecoverable
          logger.fatal(
            {
              ...commonLogFields,
              responseCode: renewResponse.statusCode,
            },
            'Failed to renew connection due to a client error. Exiting...',
          );
          process.exit(1);
          return; // process.exit is overridden during testing, so we return instead
        default: // log and retry
          logger.warn(
            {
              ...commonLogFields,
              responseCode: renewResponse.statusCode,
            },
            'Failed to renew connection.',
          );
      }

      websocket.timeoutHandlerId = setTimeout(
        timeoutHandler,
        getAuthExpirationTimeout(clientOpts.config),
      );
    };

    websocket.timeoutHandlerId = setTimeout(
      timeoutHandler,
      getAuthExpirationTimeout(clientOpts.config),
    );
  }

  websocket.on('incoming::error', (e) => {
    websocket.emit('error', { type: e.type, description: e.description });
  });

  logger.info(
    {
      url: localClientOps.config.brokerServerUrlForSocket,
      serverId: serverId,
    },
    `Broker client is connecting to broker server ${role}.`,
  );
  initializeSocketHandlers(websocket, localClientOps);

  // Websocket events
  websocket.on('identify', (serverData) =>
    identifyHandler(serverData, websocket),
  );

  websocket.on('reconnect scheduled', reconnectScheduledHandler);

  websocket.on('reconnect failed', () => reconnectFailedHandler(websocket));

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
  websocket.on('error', errorHandler);

  websocket.on('open', () =>
    openHandler(websocket, localClientOps, identifyingMetadata),
  );

  websocket.on('service', serviceHandler);

  websocket.on('close', () => {
    closeHandler(websocket, localClientOps, identifyingMetadata);
  });

  return websocket;
};
