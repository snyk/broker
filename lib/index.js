require('clarify'); // clean the stacktraces

const app = module.exports = {
  client: require('./client'),
  server: require('./server'),
};

function main({ port } = {}) {
  // note: the config is loaded in the main function to allow us to mock in tests
  const config = require('./config');

  // if the config has the broker server, then we must assume it's in client
  // mode.
  if (config.brokerUrl) {
    return app.client(config, port);
  }

  return app.server(config, port);
}

if (!module.parent) {
  main();
}

