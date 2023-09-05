import { decrementSocketConnectionGauge } from '../../common/utils/metrics';
import { log as logger } from '../../logs/logger';
import { clientDisconnected } from '../infra/dispatcher';
import { getSocketConnections } from '../socket';
import { getDesensitizedToken } from '../utils/token';

export const handleConnectionCloseOnSocket = (
  closeReason,
  socket,
  token,
  clientId,
  identified,
) => {
  if (token) {
    const { maskedToken, hashedToken } = getDesensitizedToken(token);
    if (identified) {
      const connections = getSocketConnections();
      const clientPool = connections
        .get(token)
        .filter((_) => _.socket !== socket);
      logger.info(
        {
          closeReason,
          maskedToken,
          hashedToken,
          remainingConnectionsCount: clientPool.length,
        },
        'client connection closed',
      );
      if (clientPool.length) {
        connections.set(token, clientPool);
      } else {
        logger.info({ maskedToken, hashedToken }, 'removing client');
        connections.delete(token);
      }
      decrementSocketConnectionGauge();
    } else {
      logger.warn(
        { maskedToken, hashedToken },
        'client disconnected before identifying itself',
      );
    }
    setImmediate(async () => await clientDisconnected(token, clientId));
  }
};
