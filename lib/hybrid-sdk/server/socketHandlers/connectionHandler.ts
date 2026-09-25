import { log as logger } from '../../../logs/logger';
import { getDesensitizedToken } from '../utils/token';
import { handleIdentifyOnSocket } from './identifyHandler';
import { handleConnectionCloseOnSocket } from './closeHandler';
import { handleSocketError } from './errorHandler';
import { handleTerminationSignalOnSocket } from './terminateHandler';
import { hashToken, maskToken } from '../../common/utils/token';
import { incrementSocketCloseReasonCount } from '../../common/utils/metrics';
import { ISpark } from 'primus';
import { LegacyStreamResponseHandler } from '../../LegacyStreamResponseHandler';

export const handleSocketConnection = (socket: ISpark) => {
  let clientId = null;
  let identified = false;
  let legacyResponseHandler: LegacyStreamResponseHandler | undefined;

  const token = socket.request.uri.pathname
    .replaceAll(/\/primus\/([^/]+)\//g, '$1')
    .toLowerCase();

  const desensitizedToken = getDesensitizedToken(token);
  logger.info({ desensitizedToken }, 'New client connection.');

  socket.send('identify', { capabilities: ['receive-post-streams'] });

  // TODO: type clientData and make sure we get the version
  socket.on('identify', (clientData) => {
    clientId = clientData.metadata.clientId;
    const identifiedHandler = handleIdentifyOnSocket(clientData, socket, token);
    if (!identifiedHandler) {
      return;
    }

    if (legacyResponseHandler) {
      (socket as unknown as import('events').EventEmitter).removeListener(
        'chunk',
        legacyResponseHandler,
      );
      legacyResponseHandler.dispose(
        new Error('Legacy WebSocket response handler was replaced.'),
      );
    }
    legacyResponseHandler = identifiedHandler;
    identified = true;
  });

  // Primus can emit more than one terminal event for the same socket. Treat
  // teardown as one lifecycle transition so metrics, dispatcher calls and pool
  // cleanup happen exactly once.
  let terminalEventHandled = false;
  ['close', 'end', 'disconnection', 'destroy', 'timeout'].forEach((e) =>
    socket.on(e, () => {
      if (terminalEventHandled) {
        return;
      }
      terminalEventHandled = true;
      incrementSocketCloseReasonCount(e);
      handleConnectionCloseOnSocket(e, socket, token, clientId!, identified);
    }),
  );

  // Primus emits end only after the Spark has transitioned to CLOSED. Other
  // event names handled above can also arrive as application events through
  // primus-emitter, so they are not authoritative for delivery cancellation.
  socket.on('end', () => {
    legacyResponseHandler?.dispose(
      new Error('Legacy WebSocket closed before response delivery completed.'),
    );
  });

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
