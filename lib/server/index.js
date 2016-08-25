const debug = require('debug')('broker:server');
const socket = require('./socket');
const relay = require('../relay');

module.exports = ({ config = {}, port = null, filters = {} }) => {
  debug('running');

  // start the local webserver to listen for relay requests
  const { app, server } = require('../webserver')(config, port);

  // bind the socket server to the web server
  const { io, connections } = socket({
    server,
    filters: filters.private,
  });

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
    debug('request for %s', req.url);

    next();
  }, relay.request(filters.public));

  return {
    io,
    close: done => {
      debug('closing');
      server.close();
      io.destroy(done || (() => debug('closed')));
    },
  };
};
