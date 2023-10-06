import { makeRequestToDownstream } from '../http/request';
import { PostFilterPreparedRequest } from './prepareRequest';
import { log as logger } from '../../logs/logger';
import { logError, logResponse } from '../../logs/log';
import { isJson } from '../utils/json';
import { replaceUrlPartialChunk } from '../utils/replace-vars';
import http from 'http';
import https from 'https';

export const makePostStreamingRequest = async (
  req: PostFilterPreparedRequest,
  emitCallback,
  logContext,
) => {
  // this is a streaming request for binary data
  logger.debug(logContext, 'serving stream request');

  try {
    const client = req.url.startsWith('https') ? https : http;
    const options: http.RequestOptions = {
      method: req.method,
      headers: req.headers as any,
      timeout: 600000,
    };

    const downstreamRequestHandler = client.request(req.url, options, (res) => {
      emitCallback(res, true);
    });
    if (req.body) {
      downstreamRequestHandler.write(req.body);
    }
    downstreamRequestHandler.end();
  } catch (e) {
    logger.error(
      {
        ...logContext,
        error: e,
        stackTrace: new Error('stacktrace generator').stack,
      },
      'caught error sending HTTP response over WebSocket',
    );
  }
  return;
};
export const makeLegacyRequest = async (
  req: PostFilterPreparedRequest,
  emitCallback,
  logContext,
  options,
) => {
  // not main http post flow
  try {
    const response = await makeRequestToDownstream(req);

    const contentLength = response.body.length;
    // Note that the other side of the request will also check the length and will also reject it if it's too large
    // Set to 20MB even though the server is 21MB because the server looks at the total data travelling through the websocket,
    // not just the size of the body, so allow 1MB for miscellaneous data (e.g., headers, Primus overhead)
    const maxLength =
      parseInt(options.config.socketMaxResponseLength) || 20971520;
    if (contentLength && contentLength > maxLength) {
      const errorMessage = `body size of ${contentLength} is greater than max allowed of ${maxLength} bytes`;
      logError(logContext, {
        errorMessage,
      });
      return emitCallback({
        status: 502,
        errorType: 'BODY_TOO_LARGE',
        originalBodySize: contentLength,
        body: {
          message: errorMessage,
        },
      });
    }

    const status = (response && response.statusCode) || 500;
    if (options.config.RES_BODY_URL_SUB && isJson(response.headers)) {
      const replaced = replaceUrlPartialChunk(
        response.body,
        null,
        options.config,
      );
      response.body = replaced.newChunk;
    }
    logResponse(logContext, status, response, options.config);
    emitCallback({ status, body: response.body, headers: response.headers });
  } catch (error) {
    logError(logContext, error);
    return emitCallback({
      status: 500,
      body: error,
    });
  }
};
export const legacyStreaming = (logContext, rqst, config, io, streamingID) => {
  let prevPartialChunk;
  let isResponseJson;
  logger.warn(
    logContext,
    'server did not advertise received-post-streams capability - falling back to legacy streaming',
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
