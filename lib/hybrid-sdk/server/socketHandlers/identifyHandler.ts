import { incrementSocketConnectionGauge } from '../../common/utils/metrics';
import { log as logger } from '../../../logs/logger';
import { clientConnected, clientPinged } from '../infra/dispatcher';
import { getSocketConnections } from '../socket';
import { metadataWithoutFilters } from '../utils/socket';
import { getDesensitizedToken } from '../utils/token';
import { getForwardWebSocketRequestHandler } from './initHandlers';
import semver from 'semver';
import { legacyStreamResponseHandler } from '../../LegacyStreamResponseHandler';
import { ISpark } from 'primus';
import { CLIENT_EVENT_MESSAGE } from '../../common/types/telemetry';
import { ClientEventIdentity, handleClientEvent } from './clientEventHandler';
import { StreamResponseHandler } from '../../http/server-post-stream-handler';

let response;

export const handleStreamAbort = (
  streamingID: string,
  reason: string,
): void => {
  const streamHandler = StreamResponseHandler.create(streamingID);
  if (streamHandler) {
    logger.warn(
      { streamingID, reason },
      'Client aborted response-data stream; failing originating request.',
    );
    streamHandler.destroy(
      new Error(`Client aborted response-data stream: ${reason}`),
    );
  }
};

const minimalSupportedBrokerVersion =
  process.env.MINIMAL_SUPPORTED_BROKER_VERSION ?? '4.100.0';
const minimalRecommendedBrokerVersion =
  process.env.MINIMAL_RECOMMENDED_BROKER_VERSION ?? '4.182.0';
const streamingResponse = legacyStreamResponseHandler;

export const initIdentifyHandler = () => {
  response = getForwardWebSocketRequestHandler();
};

const terminatingClientIdsPerToken = new Map<string, string[]>();

export const addClientIdToTerminationMap = (
  token: string,
  clientId: string,
) => {
  const existingTerminatedClients =
    terminatingClientIdsPerToken.get(token) ?? [];
  if (existingTerminatedClients.length > 0) {
    existingTerminatedClients.push(clientId);
    terminatingClientIdsPerToken.set(token, existingTerminatedClients);
  } else {
    terminatingClientIdsPerToken.set(token, [clientId]);
  }
};

export const rmClientIdFromTerminationMap = (
  token: string,
  clientId: string,
) => {
  if (terminatingClientIdsPerToken.has(token)) {
    const existingTerminatedClients =
      terminatingClientIdsPerToken.get(token) ?? [];
    terminatingClientIdsPerToken.set(
      token,
      existingTerminatedClients.filter((x) => x != clientId),
    );
  }
};

// TODO decide if the socket doesn't identify itself within X period,
// should we toss it away?
export const handleIdentifyOnSocket = (
  clientData,
  socket: ISpark,
  token: string,
): boolean => {
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
      'New client connection identified without a token.',
    );
    return false;
  }

  const { maskedToken, hashedToken } = getDesensitizedToken(token);
  const clientId = clientData.metadata.clientId;
  const clientVersion = clientData.metadata.version;
  // Server-owned identity for the identify log and every client event.
  const eventIdentity: ClientEventIdentity = {
    hashedToken,
    maskedToken,
    clientId,
    clientVersion,
    mode: clientData.metadata.clientConfig?.universalBroker
      ? 'universal'
      : 'legacy',
    deploymentId: clientData.metadata.deploymentId,
  };

  if (
    clientVersion != 'local' &&
    semver.lt(clientVersion, minimalSupportedBrokerVersion)
  ) {
    socket.send('notification', {
      level: 'error',
      message: `Broker client version is outdated. Minimal version: ${minimalSupportedBrokerVersion}. Please upgrade to latest version.`,
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
      message: `Broker client version is deprecated. Minimal version: ${minimalRecommendedBrokerVersion}. Please upgrade to latest version.`,
    });
  }

  logger.info(
    {
      maskedToken,
      hashedToken,
      metadata: {
        ...metadataWithoutFilters(clientData.metadata),
        mode: eventIdentity.mode,
      },
    },
    'New client connection identified.',
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
  socket.on('abort', handleStreamAbort);
  // Primus Spark extends EventEmitter at runtime. CLIENT_EVENT_MESSAGE is
  // registered only here; removeAllListeners is therefore equivalent to
  // removeListener on the one function we registered — safe to use because
  // no other code registers on this event name.
  // This guard prevents duplicate log writes if a client re-sends 'identify'.
  (socket as unknown as import('events').EventEmitter).removeAllListeners(
    CLIENT_EVENT_MESSAGE,
  );
  socket.on(CLIENT_EVENT_MESSAGE, handleClientEvent(eventIdentity));
  socket.on('incoming::ping', (time) => {
    const isTerminating =
      terminatingClientIdsPerToken.get(token)?.includes(clientId) ?? false;
    if (isTerminating) {
      logger.debug(
        { clientId },
        'Disabling client Ping since client is terminating.',
      );
      return;
    }
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
