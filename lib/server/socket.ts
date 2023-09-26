import Primus from 'primus';
import Emitter from 'primus-emitter';
import { log as logger } from '../logs/logger';
import { ServerOpts } from './types/http';
import { SocketHandler } from './types/socket';
import { handleIoError } from './socketHandlers/errorHandler';
import { handleSocketConnection } from './socketHandlers/connectionHandler';
import { initConnectionHandler } from './socketHandlers/initHandlers';

const socketConnections = new Map();

export const getSocketConnections = () => {
  return socketConnections;
};

const socket = ({ server, serverOpts: ServerOpts }): SocketHandler => {
  const ioConfig = {
    transformer: 'engine.io',
    parser: 'EJSON',
    maxLength: parseInt(ServerOpts.config.socketMaxResponseLength) || 22020096, // support up to 21MB in response bodies
    transport: {
      allowEIO3: true,
      pingInterval: parseInt(ServerOpts.config.socketPingInterval) || 25000,
      pingTimeout: parseInt(ServerOpts.config.socketPingTimeout) || 20000,
    },
    compression: Boolean(ServerOpts.config.socketUseCompression) || false,
  };

  const io = new Primus(server, ioConfig);
  io.socketType = 'server';
  io.socketVersion = 1;
  io.plugin('emitter', Emitter);

  logger.info(ioConfig, 'using io config');

  initConnectionHandler(ServerOpts, io);

  io.on('error', handleIoError);

  io.on('connection', handleSocketConnection);

  return { io };
};

export const bindSocketToWebserver = (
  server,
  serverOpts: ServerOpts,
): SocketHandler => {
  // bind the socket server to the web server
  return socket({
    server,
    serverOpts,
  });
};
