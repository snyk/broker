import {
  decrementSocketConnectionGauge,
  incrementSocketConnectionGauge,
} from '../../common/utils/metrics';
import { log as logger } from '../../logs/logger';
import {
  clientDisconnected,
  clientPinged,
  clientConnected,
} from '../infra/dispatcher';
import { getDesensitizedToken } from '../utils/token';
import { getConnections } from '../socket';
import {
  forwardWebSocketRequest,
  streamResponseHandler,
} from '../../common/relay';

let response;
const streamingResponse = streamResponseHandler;

export const initConnectionHandler = (filters, config, io) => {
  response = forwardWebSocketRequest(filters, config, io);
};
export const handleSocketConnection = (socket) => {
  const connections = getConnections();
  let token = socket.request.uri.pathname
    .replaceAll(/\/primus\/([^/]+)\//g, '$1')
    .toLowerCase();
  let clientId = null;
  let clientVersion = null;
  let identified = false;
  const desensitizedToken = getDesensitizedToken(token);
  logger.info({ desensitizedToken }, 'new client connection');

  socket.send('identify', { capabilities: ['receive-post-streams'] });

  const close = (closeReason = 'none') => {
    if (token) {
      const { maskedToken, hashedToken } = getDesensitizedToken(token);
      if (identified) {
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

  // TODO decide if the socket doesn't identify itself within X period,
  // should we toss it away?
  // TODO: type clientData and make sure we get the version
  socket.on('identify', (clientData) => {
    // clientData can be a string token coming from older broker clients,
    // OR an object coming from newer clients in the form of { token, metadata }
    if (typeof clientData === 'object') {
      token = clientData.token && clientData.token.toLowerCase();
    } else {
      token = clientData.toLowerCase(); // lowercase to standardise tokens
      // stub a proper clientData, signal client is too old
      clientData = { token, metadata: { version: 'pre-4.27' } };
    }

    if (!token) {
      logger.warn(
        { token, metadata: metadataWithoutFilters(clientData.metadata) },
        'new client connection identified without a token',
      );
      return;
    }
    // TODO: If version < cutoff version, then alert first, then deny

    const { maskedToken, hashedToken } = getDesensitizedToken(token);

    logger.info(
      {
        maskedToken,
        hashedToken,
        metadata: metadataWithoutFilters(clientData.metadata),
      },
      'new client connection identified',
    );

    const clientPool = connections.get(token) || [];
    clientPool.unshift({
      socket,
      socketType: 'server',
      socketVersion: 1,
      metadata: clientData.metadata,
    });
    connections.set(token, clientPool);

    socket.on('chunk', streamingResponse(token));
    socket.on('request', response(token));
    socket.on('incoming::ping', (time) => {
      setImmediate(
        async () => await clientPinged(token, clientId, clientVersion, time),
      );
    });

    clientId = clientData.metadata.clientId;
    clientVersion = clientData.metadata.version;
    setImmediate(
      async () => await clientConnected(token, clientId, clientVersion),
    );
    incrementSocketConnectionGauge();
    identified = true;
  });

  ['close', 'end', 'disconnect'].forEach((e) => socket.on(e, () => close(e)));
  socket.on('error', (error) => {
    logger.warn({ error }, 'error on websocket connection');
  });
};

const metadataWithoutFilters = (metadataWithFilters) => {
  return {
    capabilities: metadataWithFilters.capabilities,
    clientId: metadataWithFilters.clientId,
    preflightChecks: metadataWithFilters.preflightChecks,
    version: metadataWithFilters.version,
  };
};
