import '../common/http/patch-https-request-for-proxying';

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
import { ClientOpts } from './types/client';
import { requestHandler } from './socketHandlers/requestHandler';
import { chunkHandler } from './socketHandlers/chunkHandler';
import { initializeSocketHandlers } from './socketHandlers/init';

export const createWebSocket = (clientOps: ClientOpts, identifyingMetadata) => {
  const Socket = Primus.createSocket({
    transformer: 'engine.io',
    parser: 'EJSON',
    plugin: {
      emitter: primusEmitter,
    },
    pathname: `/primus/${clientOps.config.brokerToken}`,
  });

  if (clientOps.serverId) {
    const urlWithServerId = new URL(clientOps.config.brokerServerUrl);
    urlWithServerId.searchParams.append('server_id', clientOps.serverId);
    clientOps.config.brokerServerUrl = urlWithServerId.toString();
  }

  // Will exponentially back-off from 0.5 seconds to a maximum of 20 minutes
  // Retry for a total period of around 4.5 hours
  const io = new Socket(clientOps.config.brokerServerUrl, {
    reconnect: {
      factor: 1.5,
      retries: 30,
      max: 20 * 60 * 1000,
    },
    ping: parseInt(clientOps.config.socketPingInterval) || 25000,
    pong: parseInt(clientOps.config.socketPongTimeout) || 10000,
    timeout: parseInt(clientOps.config.socketConnectTimeout) || 10000,
  });
  io.socketVersion = 1;
  io.socketType = 'client';

  logger.info(
    { url: clientOps.config.brokerServerUrl, serverId: clientOps.serverId },
    'broker client is connecting to broker server',
  );
  initializeSocketHandlers(io, clientOps);

  // Websocket events
  io.on('identify', (serverData) => identifyHandler(serverData, io));

  io.on('reconnect scheduled', reconnectScheduledHandler);

  io.on('reconnect failed', () => reconnectFailedHandler(io));

  io.on('chunk', chunkHandler(clientOps));

  // prealably initialized
  io.on('request', requestHandler(clientOps.config.brokerToken));

  io.on('error', errorHandler);

  io.on('open', () => openHandler(io, clientOps, identifyingMetadata));

  io.on('close', () => closeHandler(clientOps));

  // only required if we're manually opening the connection
  // io.open();
  return io;
};
