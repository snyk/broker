import Primus from 'primus';
import Emitter from 'primus-emitter';
import { LoadedServerOpts } from '../common/types/options';
import { SocketHandler } from './types/socket';
import { handleIoError } from './socketHandlers/errorHandler';
import { handleSocketConnection } from './socketHandlers/connectionHandler';
import { initConnectionHandler } from './socketHandlers/initHandlers';

const socketConnections = new Map();

export const getSocketConnections = () => {
  return socketConnections;
};

const socket = ({ server, loadedServerOpts }): SocketHandler => {
  const ioConfig = {
    transformer: 'engine.io',
    parser: 'EJSON',
    maxLength:
      parseInt(loadedServerOpts.config.socketMaxResponseLength) || 22020096, // support up to 21MB in response bodies
    transport: {
      allowEIO3: true,
      pingInterval:
        parseInt(loadedServerOpts.config.socketPingInterval) || 25000,
      pingTimeout: parseInt(loadedServerOpts.config.socketPingTimeout) || 20000,
    },
    compression: Boolean(loadedServerOpts.config.socketUseCompression) || false,
  };

  const websocket = new Primus(server, ioConfig);
  websocket.socketType = 'server';
  websocket.socketVersion = 1;
  websocket.plugin('emitter', Emitter);

  initConnectionHandler(loadedServerOpts, websocket);

  websocket.on('error', handleIoError);

  websocket.on('connection', handleSocketConnection);

  return { websocket };
};

export const bindSocketToWebserver = (
  server,
  loadedServerOpts: LoadedServerOpts,
): SocketHandler => {
  // bind the socket server to the web server
  return socket({
    server,
    loadedServerOpts,
  });
};
