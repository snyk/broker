import { decrementSocketConnectionGauge } from '../../common/utils/metrics';
import { log as logger } from '../../../logs/logger';
import { clientDisconnected } from '../infra/dispatcher';
import {
  getSocketConnections,
  markRecentlyDisconnected,
  removePendingHandshake,
  removeSocketConnection,
} from '../socket';
import { getHandshakeIdentityFromHeaders } from '../auth/authHelpers';
import { getDesensitizedToken } from '../utils/token';
import { rmClientIdFromTerminationMap } from './identifyHandler';
import { ISpark } from 'primus';

export const handleConnectionCloseOnSocket = (
  closeReason: string,
  socket: ISpark,
  token: string | undefined,
  clientId: string,
  identified: boolean,
) => {
  if (token) {
    const { maskedToken, hashedToken } = getDesensitizedToken(token);
    if (identified) {
      const connections = getSocketConnections();
      const remainingConnections =
        connections.get(token)?.filter((_) => _.socket !== socket) || [];
      logger.info(
        {
          closeReason,
          maskedToken,
          hashedToken,
          remainingConnectionsCount: remainingConnections.length,
        },
        'Client connection closed.',
      );
      if (remainingConnections.length) {
        connections.set(token, remainingConnections);
        if (!remainingConnections.some((connection) => connection.socket)) {
          markRecentlyDisconnected(token);
        }
      } else {
        logger.info({ maskedToken, hashedToken }, 'Removing client.');
        removeSocketConnection(token);
      }
      decrementSocketConnectionGauge();
      rmClientIdFromTerminationMap(token, clientId);
      setImmediate(async () => await clientDisconnected(token, clientId));
    } else {
      // No pool entry references this socket, because the socket is only
      // attached by identify. The authorize hook still seated an entry for this
      // handshake, and nothing else removes it. Without this the entry remains
      // until an inbound request prunes it by handshake TTL.
      const identity = getHandshakeIdentityFromHeaders(socket.request.headers);
      const removed = removePendingHandshake(token, identity);
      logger.warn(
        { maskedToken, hashedToken, ...identity, removed },
        'Client disconnected before identifying itself.',
      );
    }
  }
};
