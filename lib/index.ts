// This is the temporary fix for https://snyk.io/vuln/SNYK-JS-PREDEFINE-1054935
// The vulnerability is introduced via snyk-broker@* › primus@6.1.0 › fusing@1.0.0 › predefine@0.1.2
// We require predefine early to replace vulnerable function `merge` with not vulnerable analog `lodash.merge`.
require('predefine').merge = require('lodash.merge');

import 'clarify'; // clean the stacktraces

import filterRulesLoader from './filter-rules-loading';
import { log as logger } from './log';
import { config as globalConfig } from './config';
process.on('uncaughtExceptionMonitor', (error, origin) => {
  logger.error({ error, origin }, 'found unhandled exception');
});

process.on('unhandledRejection', (reason: any) => {
  logger.error(
    {
      reason: reason.stack,
    },
    'caught unhandledRejection',
  );
});

export const app = async ({ port = 7341, client = false, config }) => {
  // note: the config is loaded in the main function to allow us to mock in tests
  if (process.env.JEST_WORKER_ID) {
    delete require.cache[require.resolve('./config')];
  }

  const method = client ? 'client' : 'server';
  process.env.BROKER_TYPE = method;

  const localConfig = Object.assign({}, globalConfig, config) as Record<
    string,
    any
  >;

  logger.debug({ accept: config?.accept }, 'loading rules');

  const filters = filterRulesLoader(config?.accept);
  if (method == 'client') {
    // if the localConfig has the broker server, then we must assume it's a client
    return await (
      await import('./client')
    ).main({ config: localConfig, port, filters });
  } else {
    return await (
      await import('./server')
    ).main({ config: localConfig, port, filters });
  }
};

if (!module.parent) {
  app({ config: {} }).then(() => {});
}
