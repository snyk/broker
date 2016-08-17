const Primus = require('primus');
const Emitter = require('primus-emitter');

module.exports = (server) => {
  const io = new Primus(server, { transformer: 'engine.io', parser: 'JSON' });
  io.plugin('emitter', Emitter);

  const connections = new Map();

  io.on('connection', function (socket) {
    let id = null;

    socket.on('identify', _ => {
      id = _;
      connections.set(id, socket);
    });

    // TODO if the socket doesn't identify itself within X period, we can
    // toss it away.

    socket.on('close', () => {
      connections.delete(id);
    });
  });

  return { io, connections };
};
