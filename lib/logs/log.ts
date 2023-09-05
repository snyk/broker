import { log as logger } from './logger';

export const logResponse = (logContext, status, response, config) => {
  logContext.responseStatus = status;
  logContext.responseHeaders = response.headers;
  logContext.responseBody =
    config && config.LOG_ENABLE_BODY === 'true' ? response.body : null;

  logger.info(logContext, 'sending response back to websocket connection');
};

export const logError = (logContext, error) => {
  logger.error(
    {
      ...logContext,
      error,
      stackTrace: new Error('stacktrace generator').stack,
    },
    'error while sending websocket request over HTTP connection',
  );
};
