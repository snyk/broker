// This is the temporary fix for https://snyk.io/vuln/SNYK-JS-PREDEFINE-1054935
// The vulnerability is introduced via snyk-broker@* › primus@6.1.0 › fusing@1.0.0 › predefine@0.1.2
// We require predefine early to replace vulnerable function `merge` with not vulnerable analog `lodash.merge`.
require('predefine').merge = require('lodash.merge');

require('clarify'); // clean the stacktraces
const path = require('path');
const yaml = require('js-yaml');
const fs = require('fs');
const logger = require('./log');

const app = (module.exports = {
  client: require('./client'),
  server: require('./server'),
  main: main,
});

function main({ port, client, config = {} } = {}) {
  // note: the config is loaded in the main function to allow us to mock in tests
  if (process.env.TAP) {
    delete require.cache[require.resolve('./config')];
  }

  // merge provided config with env
  const localConfig = Object.assign({}, require('./config'), config);

  if (client === undefined) {
    client = !!localConfig.brokerServerUrl;
  }

  if (!localConfig.BROKER_CLIENT_URL) {
    const proto = !localConfig.key && !localConfig.cert ? 'http' : 'https';
    localConfig.BROKER_CLIENT_URL = `${proto}://localhost:${
      port || localConfig.port
    }`;
  }

  const method = client ? 'client' : 'server';
  process.env.BROKER_TYPE = method;

  logger.debug({ accept: localConfig.accept }, 'loading rules');

  let filters = {};
  if (localConfig.accept) {
    const acceptLocation = path.resolve(process.cwd(), localConfig.accept);

    filters = yaml.safeLoad(fs.readFileSync(acceptLocation, 'utf8'));
  }

  // if the localConfig has the broker server, then we must assume it's a client
  return app[method]({ config: localConfig, port, filters });
}

if (!module.parent) {
  main();
}
