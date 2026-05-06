import Primus from 'primus';
import Emitter from 'primus-emitter';
import { LoadedServerOpts } from '../common/types/options';
import { WebSocketServer, SocketHandler } from './types/socket';
import { handleIoError } from './socketHandlers/errorHandler';
import { handleSocketConnection } from './socketHandlers/connectionHandler';
import { initConnectionHandler } from './socketHandlers/initHandlers';
import { log as logger } from '../../logs/logger';
import { maskToken } from '../common/utils/token';
import {
  BrokerAuthError,
  validateBrokerClientCredentials,
} from './auth/authHelpers';

import { decode } from 'jsonwebtoken';
import { Role } from '../client/types/client';

export interface ClientSocket {
  socket?: { end() };
  socketType: 'server';
  socketVersion: number;
  brokerClientId: string;
  brokerAppClientId: string;
  role: Role;
  metadata?: any;
  credsValidationTime?: string;
}
const socketConnections = new Map<string, ClientSocket[]>();

export const getSocketConnections = () => {
  return socketConnections;
};

export const getSocketConnectionByIdentifier = (identifier: string) => {
  return socketConnections.get(identifier);
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

  const websocket = new Primus(server, ioConfig) as WebSocketServer;
  if (loadedServerOpts.config.BROKER_SERVER_MANDATORY_AUTH_ENABLED) {
    websocket.authorize(async (req, done) => {
      const connectionIdentifier = req.uri.pathname
        .replaceAll(/^\/primus\/([^/]+)\//g, '$1')
        .toLowerCase();
      const requestId = req.headers['snyk-request-id'];
      try {
        const { brokerClientId, credentials, role } =
          // deepcode ignore Ssrf: request URL comes from the filter response, with the origin url being injected by the filtered version
          await validateBrokerClientCredentials(
            req.headers,
            connectionIdentifier,
          );
        const decodedJwt = decode(credentials, { complete: true });
        const brokerAppClientId = decodedJwt?.payload['azp'] ?? '';
        const nowDate = new Date().toISOString();
        const currentClient: ClientSocket = {
          socketType: 'server',
          socketVersion: 1,
          brokerClientId,
          brokerAppClientId,
          role: (role ?? Role.primary) as Role,
          credsValidationTime: nowDate,
        };
        const connections = getSocketConnections();
        const clientPool =
          (connections.get(connectionIdentifier) as Array<ClientSocket>) || [];
        const currentClientIndex = clientPool.findIndex(
          (x) =>
            x.brokerClientId === currentClient.brokerClientId &&
            x.role === currentClient.role,
        );
        if (currentClientIndex < 0) {
          clientPool.unshift(currentClient);
        } else {
          clientPool[currentClientIndex] = {
            ...clientPool[currentClientIndex],
            ...currentClient,
          };
        }
        connections.set(connectionIdentifier, clientPool);
      } catch (err) {
        if (err instanceof BrokerAuthError) {
          logger.warn(
            {
              maskedToken: maskToken(connectionIdentifier),
              requestId,
              reason: err.message,
            },
            'Rejected broker client websocket connection.',
          );
          done({
            statusCode: 401,
            authenticate: 'Bearer',
            message: err.message,
          });
          return;
        }
        logger.error(
          {
            maskedToken: maskToken(connectionIdentifier),
            requestId,
          },
          `Unexpected error occurred while validating broker client credentials: ${err}.`,
        );
        done(err);
        return;
      }
      done(null);
    });
  }
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
