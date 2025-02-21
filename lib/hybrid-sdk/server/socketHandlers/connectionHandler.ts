import { log as logger } from '../../../logs/logger';
import { getDesensitizedToken } from '../utils/token';
import { handleIdentifyOnSocket } from './identifyHandler';
import { handleConnectionCloseOnSocket } from './closeHandler';
import { handleSocketError } from './errorHandler';

export const handleSocketConnection = (socket) => {
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

  ['close', 'end', 'disconnect'].forEach((e) =>
    socket.on(e, () =>
      handleConnectionCloseOnSocket(e, socket, token, clientId, identified),
    ),
  );

  socket.on('error', (error) => handleSocketError(error));
};
