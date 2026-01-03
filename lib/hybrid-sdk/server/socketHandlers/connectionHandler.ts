import { log as logger } from '../../../logs/logger';
import { getDesensitizedToken } from '../utils/token';
import { handleIdentifyOnSocket } from './identifyHandler';
import { handleConnectionCloseOnSocket } from './closeHandler';
import { handleSocketError } from './errorHandler';
import { handleTerminationSignalOnSocket } from './terminateHandler';
import { hashToken, maskToken } from '../../common/utils/token';
import { incrementSocketCloseReasonCount } from '../../common/utils/metrics';
import { ISpark } from 'primus';

export const handleSocketConnection = (socket: ISpark) => {
  let clientId = null;
  let identified = false;

  const token = socket.request.uri.pathname
    .replaceAll(/\/primus\/([^/]+)\//g, '$1')
    .toLowerCase();

  const desensitizedToken = getDesensitizedToken(token);
  logger.info({ desensitizedToken }, 'New client connection.');

  socket.send('identify', { capabilities: ['receive-post-streams'] });

  // TODO: type clientData and make sure we get the version
  socket.on('identify', (clientData) => {
    clientId = clientData.metadata.clientId;
    identified = handleIdentifyOnSocket(clientData, socket, token);
  });

  ['close', 'end', 'disconnection', 'destroy', 'timeout'].forEach((e) =>
    socket.on(e, () => {
      incrementSocketCloseReasonCount(e);
      handleConnectionCloseOnSocket(e, socket, token, clientId!, identified);
    }),
  );

  socket.on('terminate', (data) => {
    logger.info(
      {
        maskedToken: maskToken(token),
        hashedToken: hashToken(token),
        clientId,
        signal: data.signal,
      },
      'Socket termination signal received',
    );
    handleTerminationSignalOnSocket(token, clientId);
  });

  socket.on('error', (error) => handleSocketError(error));
};
