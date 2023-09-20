import { RequestPayload } from '../types/http';
import { LogContext } from '../types/log';
import { hashToken, maskToken } from '../utils/token';
import { log as logger } from '../../logs/logger';
import { BrokerServerPostResponseHandler } from '../http/downstream-post-stream-to-server';
import { incrementWebSocketRequestsTotal } from '../utils/metrics';
import { logError, logResponse } from '../../logs/log';
import { isJson } from '../utils/json';
import { replaceUrlPartialChunk } from '../utils/replace-vars';
import { ClientOpts } from '../../client/types/client';
import { ServerOpts } from '../../server/types/http';
import {
  makeRequestToDownstream,
  makeStreamRequestToDownstream,
} from '../http/request';
import { loadFilters } from '../filter/filtersAsync';
import {
  PostFilterPreparedRequest,
  prepareRequestFromFilterResult,
} from './prepareRequest';

const makePostStreamingRequest = async (
  req: PostFilterPreparedRequest,
  emitCallback,
  logContext,
) => {
  // this is a streaming request for binary data
  logger.debug(logContext, 'serving stream request');
  try {
    const response = makeStreamRequestToDownstream(req);
    emitCallback(response, true);
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

const makeLegacyRequest = async (req, emitCallback, logContext, options) => {
  // not main http post flow
  try {
    const response = await makeRequestToDownstream(req);
    const statusCode = response.res.statusCode;
    const responseHeaders = response.res.headers;
    let responseBody = response.body.toString();
    const contentLength = responseBody.length;
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

    if (options.config.RES_BODY_URL_SUB && isJson(responseHeaders)) {
      const replaced = replaceUrlPartialChunk(
        JSON.parse(responseBody),
        null,
        options.config,
      );
      responseBody = replaced.newChunk;
    }
    logResponse(logContext, statusCode, responseBody, options.config);
    emitCallback({
      status: statusCode,
      body: responseBody,
      headers: responseHeaders || {},
    });
  } catch (error) {
    logError(logContext, error);
    return emitCallback({
      status: 500,
      body: `${error}`,
    });
  }
};

export const forwardWebSocketRequest = (
  options: ClientOpts | ServerOpts,
  io?,
) => {
  // 1. Request coming in over websocket conn (logged)
  // 2. Filter for rule match (log and block if no match)
  // 3. Relay over HTTP conn (logged)
  // 4. Get response over HTTP conn (logged)
  // 5. Send response over websocket conn

  //   const filters = Filters(options.filters?.private);
  const filters = loadFilters(options.filters?.private);
  return (brokerToken) => {
    return async (payload: RequestPayload, emit) => {
      // Setting the transformer to inject the streamingID on the stream

      const requestId = payload.headers['snyk-request-id'];
      const logContext: LogContext = {
        url: payload.url,
        requestMethod: payload.method,
        requestHeaders: payload.headers,
        requestId,
        streamingID: payload.streamingID,
        maskedToken: maskToken(brokerToken),
        hashedToken: hashToken(brokerToken),
        transport: io?.socket?.transport?.name ?? 'unknown',
      };
      if (!requestId) {
        // This should be a warning but older clients won't send one
        // TODO make this a warning when significant majority of clients are on latest version
        logger.trace(
          logContext,
          'Header Snyk-Request-Id not included in headers passed through',
        );
      }
      const postHandler = new BrokerServerPostResponseHandler(
        logContext,
        options.config,
        brokerToken,
        payload.streamingID,
        options.config.serverId,
        requestId,
      );

      const websocketEmit = emit;

      const postOverrideEmit = (
        responseData,
        isResponseFromRequestModule = false,
      ) => {
        logContext.requestMethod = '';
        logContext.requestHeaders = {};
        // Traffic over HTTP Post

        if (isResponseFromRequestModule) {
          logger.trace(
            logContext,
            'posting streaming response back to Broker Server',
          );
          postHandler.forwardRequest(responseData);
        } else {
          // Only for responses generated internally in the Broker Client/Server
          postHandler.sendData(responseData);
        }
      };
      const legacyOverrideEmit = (
        responseData,
        isResponseFromRequestModule = false,
      ) => {
        logContext.requestMethod = '';
        logContext.requestHeaders = {};
        if (payload.streamingID) {
          if (isResponseFromRequestModule) {
            legacyStreaming(
              logContext,
              responseData,
              options.config,
              io,
              payload.streamingID,
            );
          } else {
            io.send('chunk', payload.streamingID, '', false, {
              status: responseData.status,
              headers: responseData.headers,
            });
            io.send(
              'chunk',
              payload.streamingID,
              JSON.stringify(responseData.body),
              true,
            );
          }
        } else {
          logger.trace(
            { ...logContext, responseData },
            'sending fixed response over WebSocket connection',
          );
          websocketEmit(responseData);
        }
      };
      if (io?.capabilities?.includes('receive-post-streams')) {
        emit = postOverrideEmit;
      } else {
        emit = legacyOverrideEmit;
      }

      logger.info(logContext, 'received request over websocket connection');

      const filterResponse = filters(payload);

      if (!filterResponse) {
        incrementWebSocketRequestsTotal(true);
        const reason =
          'Response does not match any accept rule, blocking websocket request';
        logContext.error = 'blocked';
        logger.warn(logContext, reason);
        return emit({
          status: 401,
          body: {
            message: 'blocked',
            reason,
            url: payload.url,
          },
        });
      } else {
        incrementWebSocketRequestsTotal(false);
        const { req, error } = await prepareRequestFromFilterResult(
          filterResponse,
          payload,
          logContext,
          options,
          brokerToken,
          io?.socketType,
        );
        logger.debug(
          logContext,
          'sending websocket request over HTTP connection',
        );
        if (error) {
          return emit({ status: error.status, body: error.errorMsg });
        }
        payload.streamingID
          ? await makePostStreamingRequest(req, emit, logContext)
          : await makeLegacyRequest(req, emit, logContext, options);
      }
    };
  };
};

const legacyStreaming = (logContext, rqst, config, io, streamingID) => {
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
