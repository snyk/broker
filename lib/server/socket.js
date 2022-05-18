const Primus = require('primus');
const Emitter = require('primus-emitter');
const logger = require('../log');
const relay = require('../relay');
const { maskToken } = require('../token');
const {
  incrementSocketConnectionGauge,
  decrementSocketConnectionGauge,
} = require('../metrics');

module.exports = ({ server, filters, config }) => {
  const ioConfig = {
    transformer: 'engine.io',
    parser: 'EJSON',
    maxLength: parseInt(config.socketMaxResponseLength) || 20971520, // support up to 20MB in response bodies
    transport: { allowEIO3: true },
    pingInterval: parseInt(config.socketPingInterval) || 30000,
    compression: Boolean(config.socketUseCompression) || false,
  };

  const io = new Primus(server, ioConfig);
  io.plugin('emitter', Emitter);

  logger.info(ioConfig, 'using io config');

  const connections = new Map();
  const response = relay.response(filters, config, io);
  const streamingResponse = relay.streamingResponse;

  io.on('error', (error) =>
    logger.error({ error }, 'Primus/engine.io server error'),
  );

  io.on('connection', function (socket) {
    logger.info('new client connection');
    let token = null;

    const close = (closeReason = 'none') => {
      if (token) {
        const maskedToken = maskToken(token);
        const clientPool = connections
          .get(token)
          .filter((_) => _.socket !== socket);
        logger.info(
          {
            closeReason,
            maskedToken,
            remainingConnectionsCount: clientPool.length,
          },
          'client connection closed',
        );
        if (clientPool.length) {
          connections.set(token, clientPool);
        } else {
          logger.info({ maskedToken }, 'removing client');
          connections.delete(token);
        }
        decrementSocketConnectionGauge();
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
          { token, metadata: clientData.metadata },
          'new client connection identified without a token',
        );
        return;
      }

      const maskedToken = maskToken(token);

      logger.info(
        { maskedToken, metadata: clientData.metadata },
        'new client connection identified',
      );

      const clientPool = connections.get(token) || [];
      clientPool.unshift({ socket, metadata: clientData.metadata });
      connections.set(token, clientPool);

      socket.on('chunk', streamingResponse(token));
      socket.on('request', response(token));

      incrementSocketConnectionGauge();
    });

    ['close', 'end', 'disconnect'].forEach((e) => socket.on(e, () => close(e)));
    socket.on('error', (error) => {
      logger.warn({ error }, 'error on websocket connection');
    });
  });

  return { io, connections };
};
