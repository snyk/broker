import { legacyStreamResponseHandler } from '../../common/relay/LegacyStreamResponseHandler';
import { incrementSocketConnectionGauge } from '../../common/utils/metrics';
import { log as logger } from '../../logs/logger';
import { clientConnected, clientPinged } from '../infra/dispatcher';
import { getSocketConnections } from '../socket';
import { metadataWithoutFilters } from '../utils/socket';
import { getDesensitizedToken } from '../utils/token';
import { getForwardWebSocketRequestHandler } from './initHandlers';

let response;
const streamingResponse = legacyStreamResponseHandler;

export const initIdentifyHandler = () => {
  response = getForwardWebSocketRequestHandler();
};

// TODO decide if the socket doesn't identify itself within X period,
// should we toss it away?
export const handleIdentifyOnSocket = (clientData, socket, token): boolean => {
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
    return false;
  }

  const { maskedToken, hashedToken } = getDesensitizedToken(token);
  const clientId = clientData.metadata.clientId;
  const clientVersion = clientData.metadata.version;
  // TODO: If version < cutoff version, then alert first, then deny
  //   if(clientVersion < minimalVersion) {
  //     socket.send('error', { message: `Broker Client Version is outdated. Minimal version: ${minimalVersion}. Please upgrade to latest version` });
  //   }
  //   if(clientVersion < minimalSupportedVersion) {
  //     socket.send('warning', { message: `Broker Client Version is outdated. Minimal version: ${minimalVersion}. Please upgrade to latest version` });
  //   }

  logger.info(
    {
      maskedToken,
      hashedToken,
      metadata: metadataWithoutFilters(clientData.metadata),
    },
    'new client connection identified',
  );
  const connections = getSocketConnections();
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

  setImmediate(
    async () => await clientConnected(token, clientId, clientVersion),
  );
  incrementSocketConnectionGauge();
  return true;
};
