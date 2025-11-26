import { log as logger } from './logger';

export const logResponse = (
  logContext: Record<string, unknown>,
  status: number,
  response: { body: unknown },
  config: { LOG_ENABLE_BODY?: string },
) => {
  logContext.responseStatus = status;
  logContext.responseBody =
    config && config.LOG_ENABLE_BODY === 'true' ? response.body : null;

  logger.info(logContext, 'Sending response back to websocket connection.');
};

export const logError = (
  logContext: Record<string, unknown>,
  error: unknown,
) => {
  logger.error(
    {
      ...logContext,
      error,
      stackTrace: new Error('stacktrace generator').stack,
    },
    'Error while sending websocket request over HTTP connection.',
  );
};
