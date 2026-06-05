import { log as logger } from '../../logs/logger';

export const retry = async <T>(
  fn: () => Promise<T> | T,
  { retries, operation } = { retries: 30, operation: '' },
  attempt = 0,
) => {
  try {
    return await fn();
  } catch (error) {
    logger.debug({ attempt, operation, error }, 'failed to execute retry');

    if (retries <= 0) {
      throw error;
    }

    const backoff = 2 ** attempt * 100;
    const timeout = backoff > 60_000 ? 60_000 : backoff;

    logger.warn(
      { attempt, operation, timeout },
      `Waiting for ${timeout}ms before next try.`,
    );

    await sleep(timeout);
    attempt++;

    return retry(fn, { retries: retries - 1, operation }, attempt);
  }
};

const sleep = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
