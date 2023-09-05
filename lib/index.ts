import 'clarify'; // clean the stacktraces

import filterRulesLoader from './common/filter/filter-rules-loading';
import { log as logger } from './logs/logger';
import { config as globalConfig } from './common/config';
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
    delete require.cache[require.resolve('./common/config')];
  }

  const method = client ? 'client' : 'server';
  process.env.BROKER_TYPE = method;

  const localConfig = Object.assign({}, globalConfig, config) as Record<
    string,
    any
  >;
  const filters = filterRulesLoader(localConfig?.accept);
  if (method == 'client') {
    // if the localConfig has the broker server, then we must assume it's a client
    return await (
      await import('./client')
    ).main({ config: localConfig, port: localConfig.port || port, filters });
  } else {
    return await (
      await import('./server')
    ).main({ config: localConfig, port: localConfig.port || port, filters });
  }
};

if (!module.parent) {
  app({ config: {} }).then(() => {});
}
