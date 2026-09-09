import { log as logger } from '../logs/logger';
import { logError, logResponse } from '../logs/log';
import { replaceUrlPartialChunk } from './common/utils/replace-vars';
import { getResponseBodyUrlSubstitutionPolicy } from './common/utils/response-body-url-substitution';

export const legacyStreaming = (
  logContext,
  response,
  config,
  io,
  streamingID,
) => {
  let prevPartialChunk;
  logger.info(
    logContext,
    'Server did not advertise received-post-streams capability - falling back to legacy streaming.',
  );
  // Fall back to older streaming method if somehow connected to older server version
  const status = (response && response.statusCode) || 500;
  logResponse(logContext, status, response, config);
  const substitutionPolicy = getResponseBodyUrlSubstitutionPolicy(
    config,
    response.headers,
  );
  io.send('chunk', streamingID, '', false, {
    status,
    headers: substitutionPolicy.headers,
  });

  response
    .on('data', (chunk) => {
      if (substitutionPolicy.applies) {
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
