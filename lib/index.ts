import 'clarify'; // clean the stacktraces
import { log as logger } from './logs/logger';
import { getConfig, loadBrokerConfig } from './hybrid-sdk/common/config/config';
import { CONFIGURATION } from './hybrid-sdk/common/types/options';

process.on('uncaughtExceptionMonitor', (error: unknown, origin: string) => {
  logger.error({ error, origin }, 'found unhandled exception');
});

process.on('unhandledRejection', (reason: unknown) => {
  const reasonStack = reason instanceof Error ? reason.stack : 'Unknown';
  logger.error(
    {
      reason: reasonStack,
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

    await loadBrokerConfig();
    const globalConfig = getConfig();
    const localConfig = Object.assign({}, globalConfig, config) as Record<
      string,
      unknown
    > as CONFIGURATION;
    localConfig.brokerType = method;
    if (method == 'client') {
      return await (
        await import('./hybrid-sdk/client/index.js')
      ).main({
        config: localConfig,
        port: localConfig.port || port,
      });
    } else {
      return await (
        await import('./hybrid-sdk/server/index.js')
      ).main({
        config: localConfig,
        port: localConfig.port || port,
      });
    }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error }, `${errorMessage}`);

    throw error;
  }
};

if (!module.parent) {
  app({ config: {} }).then(() => {});
}
