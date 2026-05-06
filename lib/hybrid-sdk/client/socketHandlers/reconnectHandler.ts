import { log as logger } from '../../../logs/logger';

export const reconnectScheduledHandler = (opts, requestId?: string) => {
  const attemptIn = Math.floor(opts.scheduled / 1000);
  logger.warn(
    { requestId },
    `Reconnect retry #${opts.attempt} of ${opts.retries} in about ${attemptIn}s.`,
  );
};

export const reconnectFailedHandler = (io) => {
  io.end();
  logger.error('Reconnect failed.');
  process.exit(1);
};
