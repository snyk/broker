const primus = require('primus');
const socket = require('./socket');
const relay = require('../relay');
const logger = require('../log');
const version = require('../version');

module.exports = ({ port = null, config = {}, filters = {} }) => {
  logger.info({ version }, 'running in client mode');

  const identifyingMetadata = {
    version,
    filters,
  };

  const io = socket({
    token: config.brokerToken,
    url: config.brokerServerUrl,
    filters: filters.private,
    config,
    identifyingMetadata,
  });

  // start the local webserver to listen for relay requests
  const { app, server } = require('../webserver')(config, port);

  // IMPORTANT: defined before relay (`app.all('/*', ...`)
  app.get(config.brokerHealthcheckPath || '/healthcheck', (req, res) => {
    // io.readyState sets the success of the healthcheck
    // value of primus.Spark.OPEN means the websocket connection is open
    const isConnOpen = (io.readyState === primus.Spark.OPEN);
    const status = isConnOpen ? 200 : 500;
    const data = {
      ok: isConnOpen,
      websocketConnectionOpen: isConnOpen,
      brokerServerUrl: io.url.href,
      version,
    };

    return res.status(status).json(data);
  });

  app.all('/*', (req, res, next) => {
    res.locals.io = io;
    next();
  }, relay.request(filters.public));

  return {
    io,
    close: done => {
      logger.info('client websocket is closing');
      server.close();
      io.destroy(function () {
        logger.info('client websocket is closed');
        if (done) {
          return done();
        }
      });
    },
  };
};
