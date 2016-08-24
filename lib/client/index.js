const debug = require('debug')('broker:client');
const socket = require('./socket');
const relay = require('../relay');

module.exports = ({ port = null, config = {}, filters = {} }) => {
  debug('running');

  // start the local webserver to listen for relay requests
  const { app, server } = require('../webserver')(config, port);

  const io = socket({
    id: config.brokerId,
    url: config.brokerUrl,
    filters: filters.private,
  });

  app.all('/*', (req, res, next) => {
    res.locals.io = io;
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
