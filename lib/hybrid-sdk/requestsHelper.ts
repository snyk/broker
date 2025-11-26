import { makeStreamingRequestToDownstream } from './http/request';
import { log as logger } from '../logs/logger';
import { logError, logResponse } from '../logs/log';
import { isJson } from './common/utils/json';
import { replaceUrlPartialChunk } from './common/utils/replace-vars';
import { PostFilterPreparedRequest } from '../broker-workload/prepareRequest';
import { LogContext } from './common/types/log';
import { IncomingMessage } from 'http';

export const makePostStreamingRequest = async (
  req: PostFilterPreparedRequest,
  emitCallback: (response: IncomingMessage) => void,
  logContext: LogContext,
) => {
  // this is a streaming request for binary data
  logger.debug(
    logContext,
    '[Downstream] Make Post stream request to downstream',
  );

  try {
    const downstreamRequestIncomingResponse =
      await makeStreamingRequestToDownstream(req);
    emitCallback(downstreamRequestIncomingResponse);
  } catch (e) {
    logger.error(
      {
        ...logContext,
        error: e,
        stackTrace: new Error('stacktrace generator').stack,
      },
      '[Downstream] Caught error making streaming request to downstream ',
    );
  }
  return;
};
export const legacyStreaming = (
  logContext: Record<string, unknown>,
  rqst,
  config: {
    BROKER_TOKEN?: string;
    RES_BODY_URL_SUB?: string;
    LOG_ENABLE_BODY?: string;
  },
  io,
  streamingID: string,
) => {
  let prevPartialChunk: string | undefined;
  let isResponseJson: boolean;
  logger.warn(
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
    .on('data', (chunk: string) => {
      if (config.RES_BODY_URL_SUB && isResponseJson) {
        const { newChunk, partial } = replaceUrlPartialChunk(
          Buffer.from(chunk).toString(),
          prevPartialChunk!,
          config as { BROKER_TOKEN: string; RES_BODY_URL_SUB: string },
        );
        prevPartialChunk = partial;
        chunk = newChunk;
      }
      io.send('chunk', streamingID, chunk, false);
    })
    .on('end', () => {
      io.send('chunk', streamingID, '', true);
    })
    .on('error', (error: unknown) => {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      logError(logContext, error);
      io.send('chunk', streamingID, errMsg, true, {
        status: 500,
      });
    });
};
