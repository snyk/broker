const debug = require('debug')('broker:server');
const socket = require('./socket');
const relay = require('../relay');

module.exports = function ({ port = null }) {
  debug('running server');
  // we import config here to allow the tests to invalidate the require cache
  const config = require('../config');

  const { app, server } = require('../webserver')(config, port);

  // bind the socket server to the web server
  const { io, connections } = socket(server);

  app.all('/broker/:id/*', (req, res, next) => {
    const id = req.params.id;

    // check if we have this broker in the connections
    if (!connections.has(id)) {
      debug('no broker found matching "%s"', id);
      return res.status(404).send(null);
    }

    res.locals.io = connections.get(id);

     // strip the leading url
    req.url = req.url.slice(`/broker/${id}`.length);

    next();
  }, relay.request);

  return {
    io,
    close: () => {
      debug('closing');
      server.close();
      io.end();
    },
  };
};
