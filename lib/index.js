require('clarify'); // clean the stacktraces
const path = require('path');
const debug = require('debug')('broker');

function main({ port, client = false } = {}) {
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
    port = config.PORT || 7341;
  }

  debug('local server listening @ %s', port);
  const server = app.listen(port);
  let socket = null;

  if (config.brokerServer) {
    // connect to server
    debug('starting as client');
    socket = require('./client')({
      id: config.id,
      url: config.brokerServer,
    });
  } else {
    debug('starting as server');
    socket = require('./server')({ server, app });
  }

  return {
    app,
    server,
    socket,
    close: () => {
      server.close();
      socket.io.end();
    },
  };
}

if (!module.parent) {
  main();
} else {
  module.exports = main;
}

