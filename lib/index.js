require('clarify'); // clean the stacktraces
const path = require('path');

const app = module.exports = {
  client: require('./client'),
  server: require('./server'),
  main: main,
};

function main({ port, client } = {}) {
  // note: the config is loaded in the main function to allow us to mock in tests
  const config = require('./config');
  if (client === undefined) {
    client = !!config.brokerUrl;
  }

  const method = client ? 'client' : 'server';
  process.env.BROKER_TYPE = method;

  let filters = {};
  if (config.accept) {
    require('debug')(`broker:${method}`)('loading rules from %s', config.accept);
    filters = require(path.resolve(process.cwd(), config.accept));
  }


  // if the config has the broker server, then we must assume it's a client
  return app[method]({ config, port, filters });
}

if (!module.parent) {
  main();
}

