const debug = require('debug')('broker:client');
const socket = require('./socket');
const relay = require('../relay');

module.exports = ({ port = null }) => {
  debug('running client');
  // we import config here to allow the tests to invalidate the require cache
  const config = require('../config');

  // start the local webserver to listen for relay requests
  const { app, server } = require('../webserver')(config, port);

  const io = socket({
    id: config.brokerId,
    url: config.brokerUrl,
  });

  app.all('/*', (req, res, next) => {
    res.locals.io = io;
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
