const Socket = require('./socket');
const debug = require('debug')('broker:server');

module.exports = function ({ app, server }) {
  const socket = Socket(server);

  app.all('/broker/:id/*', (req, res) => {
    const id = req.params.id;

    // check if we have this broker in the connections
    if (!socket.connections.has(id)) {
      debug('no broker found matching "%s"', id);
      return res.status(404).send(null);
    }

    const io = socket.connections.get(id);

    debug('send socket request for', req.url.slice(`/broker/${id}`.length));

    // TODO decide whether we need headers too
    io.send('request', {
      url: req.url.slice(`/broker/${id}`.length), // strip the leading
      method: req.method,
      body: req.body,
    }, response => {
      res.status(response.status).send(response.body);
    });
  });

  return socket;
};
