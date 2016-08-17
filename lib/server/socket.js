const Primus = require('primus');
const Emitter = require('primus-emitter');
const debug = require('debug')('broker:server');

module.exports = (server) => {
  const io = new Primus(server, { transformer: 'engine.io', parser: 'JSON' });
  io.plugin('emitter', Emitter);

  const connections = new Map();

  io.on('error', error => console.error(error.stack));

  io.on('connection', function (socket) {
    let id = null;

    debug('new connection');

    socket.on('identify', _ => {
      id = _;
      debug('new client identified: %s', id);
      connections.set(id, socket);
    });

    // TODO if the socket doesn't identify itself within X period, we can
    // toss it away.

    socket.on('close', () => {
      debug('%s closed', id);
      connections.delete(id);
    });
  });

  return { io, connections };
};
