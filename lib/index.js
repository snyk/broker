require('clarify'); // clean the stacktraces

function main({ port } = {}) {
  // note: the config is loaded in the main function to allow us to mock in tests
  const config = require('./config');

  // if the config has the broker server, then we must assume it's in client
  // mode.
  if (config.brokerServer) {
    return require('./client')(port);
  } else {
    return require('./server')(port);
  }
}

if (!module.parent) {
  main();
} else {
  module.exports = main;
}

