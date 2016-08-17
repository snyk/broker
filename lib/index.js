'use strict';
require('clarify'); // clean the stacktraces
const debug = require('debug')('broker');

function main(port) {
  // note: the config is loaded in the main function to allow us to mock in tests
  const config = require('./config')();
  const app = require('./webserver')({
    http:
      (!config.httpsKey && !config.httpsCert) || // if there's no https certs
      process.env.NODE_ENV === 'development', // or developing/testing
    key: config.httpsKey,
    cert: config.httpsCert,
  });

  if (!port) {
    port = config.PORT || process.env.PORT || 1337;
  }

  debug('local server listening on %s', port);
  const server = app.listen(port);
  let socket = null;

  if (config.brokerServer) {
    // connect to server
    debug('starting as client');
    const filters = require('./filters')(config.filters && require(config.filters));
    socket = require('./client')({ url: config.brokerServer, filters });
  } else {
    debug('starting as server');
    socket = require('./server')({ server, app });
  }

  return { app, server, socket };
}

if (!module.parent) {
  main();
} else {
  module.exports = main;
}

