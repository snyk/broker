import Primus from 'primus';
import Emitter from 'primus-emitter';
import { log as logger } from '../log';
import { forwardWebSocketRequest, streamResponseHandler } from '../relay';
import { maskToken, hashToken } from '../token';
import {
  incrementSocketConnectionGauge,
  decrementSocketConnectionGauge,
} from '../metrics';
import {
  clientDisconnected,
  clientConnected,
  clientPinged,
} from '../dispatcher';

export default ({ server, filters, config }) => {
  // Requires are done recursively, so this is here to avoid contaminating the Client

  const ioConfig = {
    transformer: 'engine.io',
    parser: 'EJSON',
    maxLength: parseInt(config.socketMaxResponseLength) || 22020096, // support up to 21MB in response bodies
    transport: {
      allowEIO3: true,
      pingInterval: parseInt(config.socketPingInterval) || 25000,
      pingTimeout: parseInt(config.socketPingTimeout) || 20000,
    },
    compression: Boolean(config.socketUseCompression) || false,
  };

  const io = new Primus(server, ioConfig);
  io.socketType = 'server';
  io.socketVersion = 1;
  io.plugin('emitter', Emitter);

  logger.info(ioConfig, 'using io config');

  const connections = new Map();
  const response = forwardWebSocketRequest(filters, config, io);
  const streamingResponse = streamResponseHandler;

  io.on('error', (error) =>
    logger.error({ error }, 'Primus/engine.io server error'),
  );

  io.on('connection', function (socket) {
    let token = socket.request.uri.pathname
      .replaceAll(/\/primus\/([^/]+)\//g, '$1')
      .toLowerCase();
    let clientId = null;
    let clientVersion = null;
    let identified = false;
    logger.info(
      { maskedToken: maskToken(token), hashedToken: hashToken(token) },
      'new client connection',
    );

    socket.send('identify', { capabilities: ['receive-post-streams'] });

    const close = (closeReason = 'none') => {
      if (token) {
        const maskedToken = maskToken(token);
        const hashedToken = hashToken(token);
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

      const maskedToken = maskToken(token);
      const hashedToken = hashToken(token);

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
  });

  return { io, connections };
};

const metadataWithoutFilters = (metadataWithFilters) => {
  return {
    capabilities: metadataWithFilters.capabilities,
    clientId: metadataWithFilters.clientId,
    preflightChecks: metadataWithFilters.preflightChecks,
    version: metadataWithFilters.version,
  };
};
