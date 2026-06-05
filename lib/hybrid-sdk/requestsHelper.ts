import { log as logger } from '../logs/logger';
import { logError, logResponse } from '../logs/log';
import { isJson } from './common/utils/json';
import { replaceUrlPartialChunk } from './common/utils/replace-vars';

export const legacyStreaming = (logContext, rqst, config, io, streamingID) => {
  let prevPartialChunk;
  let isResponseJson;
  logger.info(
    logContext,
    'Server did not advertise received-post-streams capability - falling back to legacy streaming.',
  );
  // Fall back to older streaming method if somehow connected to older server version
  rqst
    .on('response', (response) => {
      const status = (response && response.statusCode) || 500;
      logResponse(logContext, status, response, config);
      isResponseJson = isJson(response.headers);
      io.send('chunk', streamingID, '', false, {
        status,
        headers: response.headers,
      });
    })
    .on('data', (chunk) => {
      if (config.RES_BODY_URL_SUB && isResponseJson) {
        const { newChunk, partial } = replaceUrlPartialChunk(
          Buffer.from(chunk).toString(),
          prevPartialChunk,
          config,
        );
        prevPartialChunk = partial;
        chunk = newChunk;
      }
      io.send('chunk', streamingID, chunk, false);
    })
    .on('end', () => {
      io.send('chunk', streamingID, '', true);
    })
    .on('error', (error) => {
      logError(logContext, error);
      io.send('chunk', streamingID, error.message, true, {
        status: 500,
      });
    });
};
