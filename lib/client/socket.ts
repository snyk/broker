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
import { ClientOpts } from './types/client';
import { requestHandler } from './socketHandlers/requestHandler';
import { chunkHandler } from './socketHandlers/chunkHandler';
import { initializeSocketHandlers } from './socketHandlers/init';
import { SocketOptions } from 'primus';

export const createWebSocket = (
  clientOpts: ClientOpts,
  identifyingMetadata,
) => {
  const socketOptions: SocketOptions = {
    transformer: 'engine.io',
    parser: 'EJSON',
    plugin: {
      emitter: primusEmitter,
    },
    //@ts-ignore
    pathname: `/primus/${clientOpts.config.brokerToken}`,
  };

  const Socket = Primus.createSocket(socketOptions);

  const urlWithServerId = new URL(clientOpts.config.brokerServerUrl);
  if (clientOpts.config.serverId) {
    urlWithServerId.searchParams.append(
      'server_id',
      clientOpts.config.serverId,
    );
  }
  clientOpts.config.brokerServerUrlForSocket = urlWithServerId.toString();

  // Will exponentially back-off from 0.5 seconds to a maximum of 20 minutes
  // Retry for a total period of around 4.5 hours
  const io = new Socket(clientOpts.config.brokerServerUrlForSocket, {
    reconnect: {
      factor: 1.5,
      retries: 30,
      max: 20 * 60 * 1000,
    },
    // ping: parseInt(clientOpts.config.socketPingInterval) || 25000,
    // pong: parseInt(clientOpts.config.socketPongTimeout) || 10000,
    pingTimeout: parseInt(clientOpts.config.socketPingTimeout) || 20000,
    timeout: parseInt(clientOpts.config.socketConnectTimeout) || 10000,
  });
  // @ts-ignore
  io.socketVersion = 1;
  // @ts-ignore
  io.socketType = 'client';

  logger.info(
    {
      url: clientOpts.config.brokerServerUrlForSocket,
      serverId: clientOpts.config.serverId,
    },
    'broker client is connecting to broker server',
  );
  initializeSocketHandlers(io, clientOpts);

  // Websocket events
  // @ts-ignore
  io.on('identify', (serverData) => identifyHandler(serverData, io));

  io.on('reconnect scheduled', reconnectScheduledHandler);

  io.on('reconnect failed', () => reconnectFailedHandler(io));

  // @ts-ignore
  io.on('chunk', chunkHandler(clientOpts));

  // prealably initialized
  // @ts-ignore
  io.on('request', requestHandler(clientOpts.config.brokerToken));
  // @ts-ignore
  io.on('error', errorHandler);

  io.on('open', () => openHandler(io, clientOpts, identifyingMetadata));
  // @ts-ignore
  io.on('close', () => closeHandler(clientOpts));
  // only required if we're manually opening the connection
  // io.open();
  return io;
};
