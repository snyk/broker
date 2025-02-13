import Primus from 'primus';
import Emitter from 'primus-emitter';
import { LoadedServerOpts } from '../common/types/options';
import { SocketHandler } from './types/socket';
import { handleIoError } from './socketHandlers/errorHandler';
import { handleSocketConnection } from './socketHandlers/connectionHandler';
import { initConnectionHandler } from './socketHandlers/initHandlers';
import { log as logger } from '../logs/logger';
import { maskToken } from '../common/utils/token';
import { validateBrokerClientCredentials } from './auth/authHelpers';
import { Role } from '../client/types/client';
import { decode } from 'jsonwebtoken';

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

  const websocket = new Primus(server, ioConfig);
  if (loadedServerOpts.config.BROKER_SERVER_MANDATORY_AUTH_ENABLED) {
    websocket.authorize(async (req, done) => {
      const connectionIdentifier = req.uri.pathname
        .replaceAll(/^\/primus\/([^/]+)\//g, '$1')
        .toLowerCase();
      const maskedToken = maskToken(connectionIdentifier);
      const authHeader =
        req.headers['Authorization'] ?? req.headers['authorization'];
      const brokerClientId = req.headers['x-snyk-broker-client-id'] ?? null;
      const role = req.headers['x-snyk-broker-client-role'] ?? null;
      if (
        (!authHeader ||
          !authHeader.toLowerCase().startsWith('bearer') ||
          !brokerClientId) &&
        loadedServerOpts.config.BROKER_SERVER_MANDATORY_AUTH_ENABLED
      ) {
        logger.debug({ maskedToken }, 'request missing Authorization header');
        done({
          statusCode: 401,
          authenticate: 'Bearer',
          message: 'missing required authorization header',
        });
        return;
      }

      const jwt = authHeader
        ? authHeader.substring(authHeader.indexOf(' ') + 1)
        : '';
      if (
        !jwt &&
        loadedServerOpts.config.BROKER_SERVER_MANDATORY_AUTH_ENABLED
      ) {
        done({
          statusCode: 401,
          authenticate: 'Bearer',
          message: 'Invalid JWT',
        });
        return;
      } else {
        logger.debug(
          { maskedToken: maskToken(connectionIdentifier), brokerClientId },
          `Validating auth for connection ${connectionIdentifier} client Id ${brokerClientId}, role ${role}`,
        );
        const credsCheckResponse = await validateBrokerClientCredentials(
          authHeader,
          brokerClientId,
          connectionIdentifier,
        );
        if (!credsCheckResponse) {
          logger.debug(
            { maskedToken: maskToken(connectionIdentifier), brokerClientId },
            `Denied auth for Connection ${connectionIdentifier} client Id ${brokerClientId}, role ${role}`,
          );
          done({
            statusCode: 401,
            authenticate: 'Bearer',
            message: 'Invalid credentials.',
          });
          return;
        }

        logger.debug(
          { maskedToken: maskToken(connectionIdentifier), brokerClientId },
          `Successful auth for Connection ${connectionIdentifier} client Id ${brokerClientId}, role ${role}`,
        );

        const decodedJwt = decode(jwt, { complete: true });
        const brokerAppClientId = decodedJwt?.payload['azp'] ?? '';
        const nowDate = new Date().toISOString();
        const currentClient: ClientSocket = {
          socketType: 'server',
          socketVersion: 1,
          brokerClientId: brokerClientId,
          brokerAppClientId: brokerAppClientId,
          role: role ?? Role.primary,
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
      }
      done();
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
