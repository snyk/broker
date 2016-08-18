const Primus = require('primus');
const Emitter = require('primus-emitter');
const debug = require('debug')('broker:server');

module.exports = (server) => {
  const io = new Primus(server, { transformer: 'engine.io', parser: 'JSON' });
  io.plugin('emitter', Emitter);

  const connections = new Map();

  io.on('error', error => console.error(error.stack));

  io.on('offline', () => console.error('Internet access has gone offline'));
  io.on('online', () => console.error('Access online'));

  io.on('connection', function (socket) {
    let id = null;

    debug('new connection');

    socket.on('identify', _ => {
      id = _;
      debug('new client identified: %s', id);
      connections.set(id, socket);
    });

    // TODO decide if the socket doesn't identify itself within X period,
    // should we toss it away?

    const close = () => {
      debug('%s closed', id);
      connections.delete(id);
    };

    socket.on('close', close);
    socket.on('end', close);
    socket.on('disconnect', close);
  });

  return { io, connections };
};
