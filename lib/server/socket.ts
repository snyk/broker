import Primus from 'primus';
import Emitter from 'primus-emitter';
import { log as logger } from '../logs/logger';
import { ServerOpts } from './types/http';
import { SocketHandler } from './types/socket';
import { handleSocketError } from './socketHandlers/errorHandler';
import {
  handleSocketConnection,
  initConnectionHandler,
} from './socketHandlers/connectionHandler';

const connections = new Map();

export const getConnections = () => {
  return connections;
};

const socket = ({ server, filters, config }): SocketHandler => {
  const ioConfig = {
    transformer: 'engine.io',
    parser: 'EJSON',
    maxLength: parseInt(config.socketMaxResponseLength) || 22020096, // support up to 21MB in response bodies
    transport: {
      allowEIO3: true,
      pingInterval: parseInt(config.socketPingInterval) || 25000,
      pingTimeout: parseInt(config.socketPingTimeout) || 20000,
    },
    compression: Boolean(config.socketUseCompression) || false,
  };

  const io = new Primus(server, ioConfig);
  io.socketType = 'server';
  io.socketVersion = 1;
  io.plugin('emitter', Emitter);

  logger.info(ioConfig, 'using io config');

  initConnectionHandler(filters, config, io);

  io.on('error', handleSocketError);

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
    filters: serverOpts.filters?.private,
    config: serverOpts.config,
  });
};
