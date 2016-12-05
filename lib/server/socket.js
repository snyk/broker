const Primus = require('primus');
const Emitter = require('primus-emitter');
const debug = require('debug')('broker:server:socket');
const relay = require('../relay');

module.exports = ({ server, filters, config }) => {
  const io = new Primus(server, { transformer: 'engine.io', parser: 'EJSON' });
  io.plugin('emitter', Emitter);

  const connections = new Map();
  const response = relay.response(filters, config);

  io.on('error', error => console.error(error.stack));

  io.on('connection', function (socket) {
    debug('new client connection');

    let token = null;
    const close = () => {
      if (token) {
        debug('client %s closed', token);
        const clientPool = connections.get(token).filter(_ => _ !== socket);
        if (clientPool.length) {
          debug('client %s still have %s connection/s', token, clientPool.length);
          return connections.set(token, clientPool);
        }
        debug('removing client %s', token);
        return connections.delete(token);
      }
    };

    // TODO decide if the socket doesn't identify itself within X period,
    // should we toss it away?
    socket.on('identify', _ => {
      token = _;
      debug('client identified as %s', token);
      const clientPool = connections.get(token) || [];
      clientPool.unshift(socket);
      connections.set(token, clientPool);
      socket.on('request', response(token));
    });
    socket.on('close', close);
    socket.on('end', close);
    socket.on('disconnect', close);
  });

  return { io, connections };
};
