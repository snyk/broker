const debug = require('debug')('broker:server');
const Socket = require('./socket');
const relay = require('../relay');

module.exports = function ({ app, server }) {
  const socket = Socket(server);

  app.all('/broker/:id/*', (req, res, next) => {
    const id = req.params.id;

    // check if we have this broker in the connections
    if (!socket.connections.has(id)) {
      debug('no broker found matching "%s"', id);
      return res.status(404).send(null);
    }

    res.locals.io = socket.connections.get(id);

     // strip the leading url
    req.url = req.url.slice(`/broker/${id}`.length);

    next();
  }, relay.request);

  return socket;
};
