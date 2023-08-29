import bunyan from 'bunyan';
import Logger = require('bunyan');

/**
 * Configures and creates bunyan logger with specified level (default 'info').
 * Use `TEST_LOG_LEVEL` environment variable to override log level.
 * `fields.hostname` is removed to make test logs more readable.
 */
export function createTestLogger(): Logger {
  const level = (process.env.TEST_LOG_LEVEL as bunyan.LogLevelString) || 'info';
  const logger = bunyan.createLogger({
    name: 'broker-tests',
    level: level,
  });
  delete logger.fields.hostname;
  return logger;
}
