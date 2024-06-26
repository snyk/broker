import 'clarify'; // clean the stacktraces

import filterRulesLoader, {
  isUniversalFilters,
} from './common/filter/filter-rules-loading';
import { log as logger } from './logs/logger';
import {
  CONFIGURATION,
  getConfig,
  loadBrokerConfig,
} from './common/config/config';

import { FiltersType } from './common/types/filter';

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
  try {
    // note: the config is loaded in the main function to allow us to mock in tests
    if (process.env.JEST_WORKER_ID) {
      delete require.cache[require.resolve('./common/config/config')];
    }

    const method = client ? 'client' : 'server';
    if (process.env.UNIVERSAL_BROKER_ENABLED) {
      // Pass custom/dev config.<SERVICE_ENV>.json, otherwise default universal
      process.env.SERVICE_ENV = process.env.SERVICE_ENV || 'universal';
    }

    // loading it "manually" simplifies lot testing
    await loadBrokerConfig();
    const globalConfig = getConfig();
    const localConfig = Object.assign({}, globalConfig, config) as Record<
      string,
      any
    > as CONFIGURATION;
    localConfig.brokerType = method;
    const filters = filterRulesLoader(localConfig);
    if (!filters) {
      const error = new ReferenceError(
        `No Filters found. A Broker requires filters to run. Shutting down.`,
      );
      error['code'] = 'MISSING_FILTERS';
      logger.error({ error }, error.message);
      throw error;
    } else {
      if (method == 'client') {
        // if the localConfig has the broker server, then we must assume it's a client
        return await (
          await import('./client')
        ).main({
          config: localConfig,
          port: localConfig.port || port,
          filters,
        });
      } else {
        if (isUniversalFilters(filters)) {
          throw new ReferenceError(
            'Unexpected Universal Broker filters for server',
          );
        } else {
          const classicFilters: FiltersType = filters as FiltersType;
          return await (
            await import('./server')
          ).main({
            config: localConfig,
            port: localConfig.port || port,
            filters: classicFilters,
          });
        }
      }
    }
  } catch (error: any) {
    logger.error({ error }, `${error.message}`);

    throw error;
  }
};

if (!module.parent) {
  app({ config: {} }).then(() => {});
}
