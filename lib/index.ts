import 'clarify'; // clean the stacktraces
import { log as logger } from './logs/logger';
import { getConfig, loadBrokerConfig } from './hybrid-sdk/common/config/config';
import { CONFIGURATION } from './hybrid-sdk/common/types/options';

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
  const events = require('events');
  events.EventEmitter.defaultMaxListeners = 30;
  try {
    // note: the config is loaded in the main function to allow us to mock in tests
    if (process.env.JEST_WORKER_ID) {
      delete require.cache[
        require.resolve('./hybrid-sdk/common/config/config')
      ];
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
    if (method == 'client') {
      return await (
        await import('./hybrid-sdk/client')
      ).main({
        config: localConfig,
        port: localConfig.port || port,
      });
    } else {
      return await (
        await import('./hybrid-sdk/server')
      ).main({
        config: localConfig,
        port: localConfig.port || port,
      });
    }
  } catch (error: any) {
    logger.error({ error }, `${error.message}`);

    throw error;
  }
};

if (!module.parent) {
  app({ config: {} }).then(() => {});
}
