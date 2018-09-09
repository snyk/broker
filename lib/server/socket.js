const Primus = require('primus');
const Emitter = require('primus-emitter');
const logger = require('../log');
const relay = require('../relay');

module.exports = ({ server, filters, config }) => {
  const io = new Primus(server, { transformer: 'engine.io', parser: 'EJSON' });
  io.plugin('emitter', Emitter);

  const connections = new Map();
  const response = relay.response(filters, config);

  io.on('error', error => logger.error({ error }, 'Primus/engine.io server error'));

  io.on('connection', function (socket) {
    logger.info('new client connection');
    let token = null;

    const close = () => {
      if (token) {
        const maskedToken = token.slice(0,4) + '-...-' + token.slice(-4);
        const clientPool = connections.get(token).filter(_ => _.socket !== socket);
        logger.info({ maskedToken, remainingConnectionsCount: clientPool.length },
          'client connection closed');
        if (clientPool.length) {
          connections.set(token, clientPool);
        } else {
          logger.info({ maskedToken }, 'removing client');
          connections.delete(token);
        }
      }
    };

    // TODO decide if the socket doesn't identify itself within X period,
    // should we toss it away?
    socket.on('identify', clientData => {
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
        logger.warn({ clientData }, 'client identified without a token');
        return;
      }

      logger.info({ clientData }, 'client identified');

      const clientPool = connections.get(token) || [];
      clientPool.unshift({ socket, metadata: clientData.metadata });
      connections.set(token, clientPool);

      socket.on('request', response(token));
    });
    socket.on('close', close);
    socket.on('end', close);
    socket.on('disconnect', close);
  });

  return { io, connections };
};
