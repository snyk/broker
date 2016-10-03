require('clarify'); // clean the stacktraces
const path = require('path');

const app = module.exports = {
  client: require('./client'),
  server: require('./server'),
  main: main,
};

function main({ port, client } = {}) {
  // note: the config is loaded in the main function to allow us to mock in tests
  if (process.env.TAP) {
    delete require.cache[require.resolve('./config')];
  }
  const config = require('./config');
  if (client === undefined) {
    client = !!config.brokerServerUrl;
  }

  if (!config.BROKER_CLIENT_URL) {
    const proto = !config.key && !config.cert ? 'http' : 'https';
    config.BROKER_CLIENT_URL = `${proto}://localhost:${port || config.port}`;
  }

  const method = client ? 'client' : 'server';
  process.env.BROKER_TYPE = method;

  const debug = require('debug')(`broker:${method}`);

  debug(config.accept);

  let filters = {};
  if (config.accept) {
    debug('loading rules from %s', config.accept);
    filters = require(path.resolve(process.cwd(), config.accept));
  }


  // if the config has the broker server, then we must assume it's a client
  return app[method]({ config, port, filters });
}

if (!module.parent) {
  main();
}

