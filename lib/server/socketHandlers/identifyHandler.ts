import { legacyStreamResponseHandler } from '../../hybrid-sdk/LegacyStreamResponseHandler';
import { incrementSocketConnectionGauge } from '../../common/utils/metrics';
import { log as logger } from '../../logs/logger';
import { clientConnected, clientPinged } from '../infra/dispatcher';
import { getSocketConnections } from '../socket';
import { metadataWithoutFilters } from '../utils/socket';
import { getDesensitizedToken } from '../utils/token';
import { getForwardWebSocketRequestHandler } from './initHandlers';
import semver from 'semver';

let response;
const minimalSupportedBrokerVersion =
  process.env.MINIMAL_SUPPORTED_BROKER_VERSION ?? '4.100.0';
const minimalRecommendedBrokerVersion =
  process.env.MINIMAL_RECOMMENDED_BROKER_VERSION ?? '4.182.0';
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

  if (
    clientVersion != 'local' &&
    semver.lt(clientVersion, minimalSupportedBrokerVersion)
  ) {
    socket.send('notification', {
      level: 'error',
      message: `Broker Client Version is outdated. Minimal version: ${minimalSupportedBrokerVersion}. Please upgrade to latest version`,
    });
    socket.end();
    return false;
  }
  if (
    clientVersion != 'local' &&
    semver.lt(clientVersion, minimalRecommendedBrokerVersion)
  ) {
    socket.send('notification', {
      level: 'warning',
      message: `Broker Client Version is deprecated. Minimal version: ${minimalRecommendedBrokerVersion}. Please upgrade to latest version`,
    });
  }

  logger.info(
    {
      maskedToken,
      hashedToken,
      metadata: metadataWithoutFilters(clientData.metadata),
    },
    'new client connection identified',
  );
  const currentClient = {
    socket,
    socketType: 'server',
    socketVersion: 1,
    metadata: clientData.metadata,
    brokerClientId: clientData.metadata.clientId,
  };
  const connections = getSocketConnections();
  const clientPool = (connections.get(token) as Array<any>) || [];
  const currentClientIndex = clientPool.findIndex(
    (x) =>
      clientData.metadata.clientId &&
      x.brokerClientId === clientData.metadata.clientId &&
      clientData.metadata.role &&
      x.role === clientData.metadata.role,
  );
  if (currentClientIndex < 0) {
    clientPool.unshift(currentClient);
  } else {
    clientPool[currentClientIndex] = {
      ...clientPool[currentClientIndex],
      ...currentClient,
    };
  }
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
