require('clarify'); // clean the stacktraces
const path = require('path');
const yaml = require('js-yaml');
const fs = require('fs');
const logger = require('./log');

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

  logger.debug({ accept: config.accept }, 'loading rules');

  let filters = {};
  if (config.accept) {
    const acceptLocation = path.resolve(process.cwd(), config.accept);

    filters = yaml.safeLoad(fs.readFileSync(acceptLocation, 'utf8'));
  }

  // if the config has the broker server, then we must assume it's a client
  return app[method]({ config, port, filters });
}

if (!module.parent) {
  main();
}
