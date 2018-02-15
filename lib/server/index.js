const logger = require('../log');
const debug = require('debug')('broker:server:index');
const socket = require('./socket');
const relay = require('../relay');
const version = require('../version');

module.exports = ({ config = {}, port = null, filters = {} }) => {
  logger.info({ version }, 'running in server mode');

  // start the local webserver to listen for relay requests
  const { app, server } = require('../webserver')(config, port);

  // bind the socket server to the web server
  const { io, connections } = socket({
    server,
    filters: filters.private,
    config,
  });

  app.get('/connection-status/:id', (req, res) => {
    const id = req.params.id;

    if (connections.has(id)) {
      const metadata = connections.get(id)[0].metadata;
      return res.status(200).json({ ok: true, version: metadata.version });
    }
    debug('no broker found matching "%s"', id);
    return res.status(404).json({ ok: false });
  });

  app.all('/broker/:id/*', (req, res, next) => {
    const id = req.params.id;

    // check if we have this broker in the connections
    if (!connections.has(id)) {
      debug('no broker found matching "%s"', id);
      return res.status(404).send();
    }

    // Grab a first (newest) client from the pool
    res.locals.io = connections.get(id)[0].socket;

     // strip the leading url
    req.url = req.url.slice(`/broker/${id}`.length);
    logger.debug({ url: req.url }, 'request');

    next();
  }, relay.request(filters.public));

  app.get('/healthcheck', (req, res) =>
          res.status(200).json({ ok: true, version }));

  return {
    io,
    close: done => {
      logger.info('closing');
      server.close();
      io.destroy(done || (() => logger.info('closed')));
    },
  };
};
