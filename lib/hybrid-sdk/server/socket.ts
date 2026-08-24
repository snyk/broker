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
  getHandshakeIdentityFromHeaders,
  type HandshakeIdentity,
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
  handshakeStartTime?: number;
  handshakeId?: string;
}
const socketConnections = new Map<string, ClientSocket[]>();
const RECONNECT_GRACE_MS = 60_000;
const recentlyDisconnectedExpiryTimers = new Map<string, NodeJS.Timeout>();

export const removeSocketConnection = (token: string) => {
  socketConnections.delete(token);

  const previousExpiryTimer = recentlyDisconnectedExpiryTimers.get(token);
  if (previousExpiryTimer) {
    clearTimeout(previousExpiryTimer);
  }

  const expiryTimer = setTimeout(() => {
    if (recentlyDisconnectedExpiryTimers.get(token) === expiryTimer) {
      recentlyDisconnectedExpiryTimers.delete(token);
    }
  }, RECONNECT_GRACE_MS);
  expiryTimer.unref();
  recentlyDisconnectedExpiryTimers.set(token, expiryTimer);
};

export const wasRecentlyDisconnected = (token: string): boolean =>
  recentlyDisconnectedExpiryTimers.has(token);

export const getSocketConnections = () => {
  return socketConnections;
};

export const getSocketConnectionByIdentifier = (identifier: string) => {
  return socketConnections.get(identifier);
};

/**
 * Removes the pending entry for a handshake that closed before identifying.
 *
 * The handshake id ensures an older connection cannot remove a newer reconnect.
 * If the client did not send enough identity headers, the entry is left for the
 * TTL cleanup.
 *
 * Returns true if an entry was removed.
 */
export const removePendingHandshake = (
  identifier: string,
  { brokerClientId, role, handshakeId }: HandshakeIdentity,
): boolean => {
  if (!brokerClientId || !handshakeId) {
    return false;
  }
  const clientPool = socketConnections.get(identifier);
  if (!clientPool) {
    return false;
  }
  const pendingIndex = clientPool.findIndex(
    (client) =>
      !client.socket &&
      client.handshakeId === handshakeId &&
      client.brokerClientId === brokerClientId &&
      client.role === role,
  );
  if (pendingIndex < 0) {
    return false;
  }
  clientPool.splice(pendingIndex, 1);
  if (clientPool.length === 0) {
    socketConnections.delete(identifier);
  }
  return true;
};

/**
 * Adds a handshake to the connection pool after it has been authorized.
 *
 * A reconnect stays separate from the existing live connection, so closing the
 * old socket cannot remove the new handshake. If there is already a pending
 * handshake for the same client and role, the newer attempt replaces it.
 */
export const addAuthorizedHandshake = (
  identifier: string,
  currentClient: ClientSocket,
): void => {
  const clientPool = socketConnections.get(identifier) ?? [];
  const pendingHandshakeIndex = clientPool.findIndex(
    (client) =>
      !client.socket &&
      client.brokerClientId === currentClient.brokerClientId &&
      client.role === currentClient.role,
  );
  if (pendingHandshakeIndex < 0) {
    // Keep an identified connection separate from its reconnect attempt.
    // If the old socket closes first, the new handshake must remain seated.
    clientPool.unshift(currentClient);
  } else {
    clientPool[pendingHandshakeIndex] = currentClient;
  }
  socketConnections.set(identifier, clientPool);
};

/**
 * Finds the connection to update after an auth refresh.
 * Prefers the live connection when a reconnect is also pending, so the active
 * socket does not get disconnected for using stale credentials.
 */
export const findClientToRefreshCreds = (
  clientPool: ClientSocket[],
  brokerClientId: string,
  role: unknown,
): ClientSocket | undefined => {
  const matches = clientPool.filter(
    (client) =>
      client.brokerClientId === brokerClientId && client.role === role,
  );
  return matches.find((client) => client.socket) ?? matches[0];
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
      // Primus authorize callbacks receive the raw HTTP upgrade request before
      // the Express middleware chain runs, so req.requestId is not available here.
      // The client sends a fresh snyk-request-id per connection attempt, so it
      // also identifies this handshake when the socket later closes.
      const { handshakeId } = getHandshakeIdentityFromHeaders(req.headers);
      const requestId = handshakeId;
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
          handshakeStartTime: Date.now(),
          handshakeId,
        };
        addAuthorizedHandshake(connectionIdentifier, currentClient);
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
