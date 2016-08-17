const Socket = require('./socket');

module.exports = function ({ app, server }) {
  const socket = Socket(server);

  app.all('/broker/:id/*', (req, res, next) => {
    const id = req.params.id;

    // check if we have this broker in the connections
    if (!socket.connections.has(id)) {
      return next(404);
    }

    const io = socket.connections.get(id);

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
