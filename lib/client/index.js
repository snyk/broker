const socket = require('./socket');
const relay = require('../relay');
const logger = require('../log');

module.exports = ({ port = null, config = {}, filters = {} }) => {
  logger.info('running');

  const io = socket({
    token: config.brokerToken,
    url: config.brokerServerUrl,
    filters: filters.private,
    config,
  });

  // start the local webserver to listen for relay requests
  const { app, server } = require('../webserver')(config, port);

  // IMPORTANT: defined before relay (`app.all('/*', ...`)
  app.get('/healthcheck', (req, res, next) => {
    return res.status(200).json({ ok: true });
  });

  app.all('/*', (req, res, next) => {
    res.locals.io = io;
    next();
  }, relay.request(filters.public));

  return {
    io,
    close: done => {
      logger.info('closing');
      server.close();
      io.destroy(done || (() => logger.info('closed')));
    },
  };
};
