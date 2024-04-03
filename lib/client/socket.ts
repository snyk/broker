// import '../common/http/patch-https-request-for-proxying';

import Primus from 'primus';
import { log as logger } from '../logs/logger';
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

import { LoadedClientOpts } from '../common/types/options';
import { translateIntegrationTypeToBrokerIntegrationType } from './utils/integrations';
import { maskToken } from '../common/utils/token';
import { fetchJwt } from './auth/oauth';

export const createWebSockets = (
  clientOpts: LoadedClientOpts,
  globalIdentifyingMetadata: IdentifyingMetadata,
): WebSocketConnection[] => {
  const integrationsKeys = clientOpts.config.connections
    ? Object.keys(clientOpts.config.connections)
    : [];
  const websocketConnections: WebSocketConnection[] = [];
  for (let i = 0; i < integrationsKeys.length; i++) {
    const socketIdentifyingMetadata = Object.assign(
      {},
      globalIdentifyingMetadata,
    );
    socketIdentifyingMetadata.friendlyName = integrationsKeys[i];
    socketIdentifyingMetadata.identifier =
      clientOpts.config.connections[`${integrationsKeys[i]}`]['identifier'];
    const integrationType =
      clientOpts.config.connections[`${integrationsKeys[i]}`].type;

    // This type is different for broker, ECR/ACR/DockeHub/etc are all container-registry-agent type for broker
    socketIdentifyingMetadata.supportedIntegrationType =
      translateIntegrationTypeToBrokerIntegrationType(integrationType);
    socketIdentifyingMetadata.serverId =
      clientOpts.config.connections[`${integrationsKeys[i]}`].serverId ?? '';
    websocketConnections.push(
      createWebSocket(clientOpts, socketIdentifyingMetadata, Role.primary),
    );
    websocketConnections.push(
      createWebSocket(clientOpts, socketIdentifyingMetadata, Role.secondary),
    );
  }
  return websocketConnections;
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

  const urlWithServerIdAndRole = new URL(localClientOps.config.brokerServerUrl);
  const serverId =
    localClientOps.config.serverId ?? identifyingMetadata.serverId;
  if (serverId && serverId > -1) {
    urlWithServerIdAndRole.searchParams.append('server_id', serverId);
  }
  urlWithServerIdAndRole.searchParams.append(
    'connection_role',
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

  if (clientOpts.accessToken) {
    socketSettings['transport'] = {
      extraHeaders: {
        Authorization: clientOpts.accessToken?.authHeader,
      },
    };
  }
  const websocket: WebSocketConnection = new Socket(
    localClientOps.config.brokerServerUrlForSocket,
    socketSettings,
  );
  websocket.socketVersion = 1;
  websocket.socketType = 'client';
  if (localClientOps.config.universalBrokerEnabled) {
    websocket.identifier = identifyingMetadata.identifier;
    websocket.supportedIntegrationType =
      identifyingMetadata.supportedIntegrationType || '';
    websocket.serverId = serverId || '';
    websocket.friendlyName = identifyingMetadata.friendlyName || '';
  } else {
    websocket.identifier = maskToken(identifyingMetadata.identifier);
  }
  websocket.clientConfig = identifyingMetadata.clientConfig;
  websocket.role = identifyingMetadata.role;

  if (clientOpts.accessToken) {
    let timeoutHandlerId;
    let timeoutHandler = async () => {};
    timeoutHandler = async () => {
      logger.debug({}, 'Refreshing oauth access token');
      clearTimeout(timeoutHandlerId);
      clientOpts.accessToken = await fetchJwt(
        clientOpts.config.API_BASE_URL,
        clientOpts.config.brokerClientConfiguration.common.oauth!.clientId,
        clientOpts.config.brokerClientConfiguration.common.oauth!.clientSecret,
      );

      websocket.transport.extraHeaders['Authorization'] =
        clientOpts.accessToken!.authHeader;
      websocket.end();
      websocket.open();
      timeoutHandlerId = setTimeout(
        timeoutHandler,
        (clientOpts.accessToken!.expiresIn - 60) * 1000,
      );
    };

    timeoutHandlerId = setTimeout(
      timeoutHandler,
      (clientOpts.accessToken!.expiresIn - 60) * 1000,
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
    `broker client is connecting to broker server ${role}`,
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

  websocket.on('error', errorHandler);

  websocket.on('open', () =>
    openHandler(websocket, localClientOps, identifyingMetadata),
  );

  websocket.on('close', () =>
    closeHandler(localClientOps, identifyingMetadata),
  );

  // only required if we're manually opening the connection
  // websocket.open();
  return websocket;
};
