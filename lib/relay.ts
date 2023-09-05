import request from 'request';
import undefsafe from 'undefsafe';
import { parse } from 'url';
import { format } from 'url';
import { v4 as uuid } from 'uuid';
import Filters from './filters';
import { replace, replaceUrlPartialChunk } from './replace-vars';
import tryJSONParse from './try-json-parse';
import { log as logger } from './log';
import version from './version';
import { maskToken, hashToken } from './token';
import stream from 'stream';
import NodeCache from 'node-cache';
import {
  incrementHttpRequestsTotal,
  incrementUnableToSizeResponse,
  observeResponseSize,
  incrementWebSocketRequestsTotal,
} from './metrics';
import { config } from './config';
import { BrokerServerPostResponseHandler } from './stream-posts';
import {
  gitHubCommitSigningEnabled,
  gitHubTreeCheckNeeded,
  signGitHubCommit,
  validateGitHubTreePayload,
} from './client/scm';
import {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';

interface StreamResponse {
  streamBuffer: stream.PassThrough;
  response: ExpressResponse;
  streamSize?: number;
}

let relayRequest = request;
relayRequest = request.defaults({
  ca: config.caCert,
  timeout: process.env.BROKER_DOWNSTREAM_TIMEOUT
    ? parseInt(process.env.BROKER_DOWNSTREAM_TIMEOUT)
    : 60000,
  agentOptions: {
    keepAlive: true,
    keepAliveMsecs: 60000,
    maxTotalSockets: 1000,
  },
});

export class StreamResponseHandler {
  streamingID: string;
  streamResponse: StreamResponse;
  // streamBuffer;
  // response;
  // streamSize = 0;

  static create(streamingID) {
    const stream = streams.get(streamingID);
    if (!stream) {
      return null;
    }
    const streamResponse = stream as StreamResponse;

    return new StreamResponseHandler(
      streamingID,
      streamResponse.streamBuffer,
      streamResponse.response,
    );
  }

  constructor(streamingID, streamBuffer, response) {
    this.streamingID = streamingID;
    this.streamResponse = { streamBuffer, response, streamSize: 0 };
  }

  writeStatusAndHeaders = (statusAndHeaders) => {
    this.streamResponse.response
      .status(statusAndHeaders.status)
      .set(statusAndHeaders.headers);
  };

  writeChunk = (chunk, waitForDrainCb) => {
    this.streamResponse.streamSize += chunk.length;
    if (!this.streamResponse.streamBuffer.write(chunk) && waitForDrainCb) {
      waitForDrainCb(this.streamResponse.streamBuffer);
    }
  };

  finished = () => {
    this.streamResponse.streamBuffer.end();
    streams.del(this.streamingID);
    observeResponseSize({
      bytes: this.streamResponse.streamSize,
      isStreaming: true,
    });
  };

  destroy = (error) => {
    this.streamResponse.streamBuffer.destroy(error);
    streams.del(this.streamingID);
  };
}

const streams = new NodeCache({
  stdTTL: parseInt(config.cacheExpiry) || 3600, // 1 hour
  checkperiod: parseInt(config.cacheCheckPeriod) || 60, // 1 min
  useClones: false,
});

/**
 * @deprecated Deprecated in favour of {@link StreamResponseHandler} */
export const streamResponseHandler = (token) => {
  return (streamingID, chunk, finished, ioResponse) => {
    const streamFromId = streams.get(streamingID) as StreamResponse;

    if (streamFromId) {
      const { streamBuffer, response } = streamFromId;
      let { streamSize } = streamFromId;

      if (streamBuffer) {
        if (ioResponse) {
          response.status(ioResponse.status).set(ioResponse.headers);
        }
        if (chunk) {
          streamSize += chunk.length;
          streamBuffer.write(chunk);
          streams.set(streamingID, { streamSize, streamBuffer, response });
        }
        if (finished) {
          streamBuffer.end();
          streams.del(streamingID);
          observeResponseSize({
            bytes: streamSize,
            isStreaming: true,
          });
        }
      } else {
        logger.warn({ streamingID, token }, 'discarding binary chunk');
      }
    } else {
      logger.warn(
        { streamingID, token },
        'trying to write into a closed stream',
      );
    }
  };
};

// 1. Request coming in over HTTP conn (logged)
// 2. Filter for rule match (log and block if no match)
// 3. Relay over websocket conn (logged)
// 4. Get response over websocket conn (logged)
// 5. Send response over HTTP conn
export const forwardHttpRequest = (filterRules) => {
  const filters = Filters(filterRules);

  return (req: ExpressRequest, res: ExpressResponse) => {
    // If this is the server, we should receive a Snyk-Request-Id header from upstream
    // If this is the client, we will have to generate one
    req.headers['snyk-request-id'] ||= uuid();
    const logContext: LogContext = {
      url: req.url,
      requestMethod: req.method,
      requestHeaders: req.headers,
      requestId:
        req.headers['snyk-request-id'] &&
        Array.isArray(req.headers['snyk-request-id'])
          ? req.headers['snyk-request-id'].join(',')
          : req.headers['snyk-request-id'] || '',
      maskedToken: req['maskedToken'],
      hashedToken: req['hashedToken'],
    };

    logger.info(logContext, 'received request over HTTP connection');
    filters(req, (error, result) => {
      if (error) {
        incrementHttpRequestsTotal(true);
        const reason =
          'Request does not match any accept rule, blocking HTTP request';
        error.reason = reason;
        logContext.error = error;
        logger.warn(logContext, reason);
        // TODO: respect request headers, block according to content-type
        return res
          .status(401)
          .send({ message: error.message, reason, url: req.url });
      }
      incrementHttpRequestsTotal(false);

      req.url = result.url;
      logContext.ioUrl = result.url;

      // check if this is a streaming request for binary data
      if (
        result.stream ||
        res?.locals?.capabilities?.includes('post-streams')
      ) {
        const streamingID = uuid();
        const streamBuffer = new stream.PassThrough({ highWaterMark: 1048576 });
        streamBuffer.on('error', (error) => {
          // This may be a duplicate error, as the most likely cause of this is the POST handler calling destroy.
          logger.error(
            {
              ...logContext,
              error,
              stackTrace: new Error('stacktrace generator').stack,
            },
            'caught error piping stream through to HTTP response',
          );
          res.destroy(error);
        });
        logContext.streamingID = streamingID;
        logger.debug(
          logContext,
          'sending stream request over websocket connection',
        );

        streams.set(streamingID, {
          response: res,
          streamBuffer,
          streamSize: 0,
        });
        streamBuffer.pipe(res);

        res.locals.io.send('request', {
          url: req.url,
          method: req.method,
          body: req.body,
          headers: req.headers,
          streamingID,
        });

        return;
      }

      logger.debug(logContext, 'sending request over websocket connection');

      // relay the http request over the websocket, handle websocket response
      res.locals.io.send(
        'request',
        {
          url: req.url,
          method: req.method,
          body: req.body,
          headers: req.headers,
          streamingID: '',
        },
        (ioResponse) => {
          logContext.responseStatus = ioResponse.status;
          logContext.responseHeaders = ioResponse.headers;
          logContext.responseBodyType = typeof ioResponse.body;

          const logMsg = 'sending response back to HTTP connection';
          if (ioResponse.status <= 200) {
            logger.debug(logContext, logMsg);
            let responseBodyString = '';
            if (typeof ioResponse.body === 'string') {
              responseBodyString = ioResponse.body;
            } else if (typeof ioResponse.body === 'object') {
              responseBodyString = JSON.stringify(ioResponse.body);
            }
            if (responseBodyString) {
              const responseBodyBytes = Buffer.byteLength(
                responseBodyString,
                'utf-8',
              );
              observeResponseSize({
                bytes: responseBodyBytes,
                isStreaming: false,
              });
            } else {
              // fallback metric to let us know if we're recording all response sizes
              // we expect to remove this should it report 0
              incrementUnableToSizeResponse();
            }
          } else {
            logContext.ioErrorType = ioResponse.errorType;
            logContext.ioOriginalBodySize = ioResponse.originalBodySize;
            logger.warn(logContext, logMsg);
          }

          const httpResponse = res
            .status(ioResponse.status)
            .set(ioResponse.headers);

          const encodingType = undefsafe(
            ioResponse,
            'headers.transfer-encoding',
          );
          try {
            // keep chunked http requests without content-length header
            if (encodingType === 'chunked') {
              httpResponse.write(ioResponse.body);
              httpResponse.end();
            } else {
              httpResponse.send(ioResponse.body);
            }
          } catch (err) {
            logger.error(
              {
                ...logContext,
                encodingType,
                err,
                stackTrace: new Error('stacktrace generator').stack,
              },
              'error forwarding response from Web Socket to HTTP connection',
            );
          }
        },
      );
    });
  };
};

function legacyStreaming(logContext, rqst, config, io, streamingID) {
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
}

interface LogContext {
  url: string;
  requestMethod: string;
  requestHeaders: Record<string, any>;
  requestId: string;
  streamingID?: string;
  transport?: string;
  maskedToken: string;
  hashedToken: string;
  error?: string;
  resultUrlSchemeAdded?: boolean;
  httpUrl?: string;
  userAgentHeaderSet?: boolean;
  authHeaderSetByRuleAuth?: boolean;
  authHeaderSetByRuleUrl?: boolean;
  bodyVarsSubstitution?: string;
  headerVarsSubstitution?: string;
  ioUrl?: string;
  responseStatus?: string;
  responseHeaders?: string;
  responseBodyType?: string;
  ioErrorType?: string;
  ioOriginalBodySize?: string;
}

export interface RequestPayload {
  url: string;
  headers?: any;
  method: string;
  body?: any;
  streamingID?: string;
}

// 1. Request coming in over websocket conn (logged)
// 2. Filter for rule match (log and block if no match)
// 3. Relay over HTTP conn (logged)
// 4. Get response over HTTP conn (logged)
// 5. Send response over websocket conn
export const forwardWebSocketRequest = (
  filterRules,
  config,
  io?,
  serverId?,
) => {
  const filters = Filters(filterRules);

  return (brokerToken) => (payload: RequestPayload, emit) => {
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

    const realEmit = emit;
    emit = (responseData, isResponseFromRequestModule = false) => {
      // This only works client -> server, it's not possible to post data server -> client
      logContext.requestMethod = '';
      logContext.requestHeaders = {};
      if (io?.capabilities?.includes('receive-post-streams')) {
        const postHandler = new BrokerServerPostResponseHandler(
          logContext,
          config,
          brokerToken,
          payload.streamingID,
          serverId,
          requestId,
        );
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
      } else {
        if (payload.streamingID) {
          if (isResponseFromRequestModule) {
            legacyStreaming(
              logContext,
              responseData,
              config,
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
          realEmit(responseData);
        }
      }
    };

    logger.info(logContext, 'received request over websocket connection');

    filters(payload, async (filterError, result) => {
      if (filterError) {
        incrementWebSocketRequestsTotal(true);
        const reason =
          'Response does not match any accept rule, blocking websocket request';
        logContext.error = filterError;
        filterError.reason = reason;
        logger.warn(logContext, reason);
        return emit({
          status: 401,
          body: {
            message: filterError.message,
            reason,
            url: payload.url,
          },
        });
      }
      incrementWebSocketRequestsTotal(false);

      if (result.url.startsWith('http') === false) {
        result.url = 'https://' + result.url;
        logContext.resultUrlSchemeAdded = true;
      }

      logContext.httpUrl = result.url;

      if (!payload.headers['user-agent']) {
        payload.headers['user-agent'] = 'Snyk Broker ' + version;
        logContext.userAgentHeaderSet = true;
      }

      if (result.auth) {
        payload.headers['authorization'] = result.auth;
        logContext.authHeaderSetByRuleAuth = true;
      } else {
        const parsed = parse(result.url);
        if (parsed.auth) {
          // if URL contains basic auth,
          // remove authorization header to prefer auth on the URL.
          if (parsed.auth.includes(':')) {
            delete payload.headers['authorization'];
          }

          // if URL contains token auth,
          // put the token in the authorization header
          // instead of on the URL.
          else {
            payload.headers['authorization'] = `token ${parsed.auth}`;
            // then strip from the url
            parsed.auth = null;
            result.url = format(parsed);
          }

          logContext.authHeaderSetByRuleUrl = true;
        }
      }

      // if the request is all good - and at this point it is, we'll check
      // whether we want to do variable substitution on the body
      //
      // Variable substitution - for those who forgot - is substituting a part
      // of a given string (e.g. "${SOME_ENV_VAR}/rest/of/string")
      // with an env var of the same name (SOME_ENV_VAR).
      // This is used (for example) to substitute the snyk url
      // with the broker's url when defining the target for an incoming webhook.
      if (!config.disableBodyVarsSubstitution && payload.body) {
        const parsedBody = tryJSONParse(payload.body);

        if (parsedBody.BROKER_VAR_SUB) {
          logContext.bodyVarsSubstitution = parsedBody.BROKER_VAR_SUB;
          for (const path of parsedBody.BROKER_VAR_SUB) {
            let source = undefsafe(parsedBody, path); // get the value
            source = replace(source, config); // replace the variables
            undefsafe(parsedBody, path, source); // put it back in
          }
          payload.body = JSON.stringify(parsedBody);
        }
      }

      if (
        !config.disableHeaderVarsSubstitution &&
        payload.headers &&
        payload.headers['x-broker-var-sub']
      ) {
        // check whether we want to do variable substitution on the headers
        logContext.headerVarsSubstitution = payload.headers['x-broker-var-sub'];
        for (const path of payload.headers['x-broker-var-sub'].split(',')) {
          let source = undefsafe(payload.headers, path.trim()); // get the value
          source = replace(source, config); // replace the variables
          undefsafe(payload.headers, path.trim(), source); // put it back in
        }
      }

      // remove headers that we don't want to relay
      // (because they corrupt the request)
      [
        'x-forwarded-for',
        'x-forwarded-proto',
        'content-length',
        'host',
        'accept-encoding',
        'content-encoding',
      ].map((_) => delete payload.headers[_]);

      if (config.removeXForwardedHeaders === 'true') {
        for (const key in payload.headers) {
          if (key.startsWith('x-forwarded-')) {
            delete payload.headers[key];
          }
        }

        if (payload.headers['forwarded']) {
          delete payload.headers['forwarded'];
        }
      }

      if (brokerToken && io?.socketType === 'server') {
        Object.assign(payload.headers, { 'X-Broker-Token': brokerToken });
      }

      logger.debug(
        logContext,
        'sending websocket request over HTTP connection',
      );

      // Sometimes we receive the body as a {type, data} object
      // Unsure why - possibly Primus?
      if (payload.body?.type === 'Buffer')
        payload.body = Buffer.of(payload.body.data);

      // Request library is buggy and will throw an error if we're POST'ing an empty body without an explicit Content-Length header
      if (!payload.body || payload.body.length === 0) {
        payload.headers['Content-Length'] = '0';
      }

      payload.headers['connection'] = 'Keep-Alive';
      payload.headers['Keep-Alive'] = 'timeout=60, max=1000';

      if (
        gitHubTreeCheckNeeded(config, {
          method: payload.method,
          url: payload.url,
        })
      ) {
        try {
          validateGitHubTreePayload(payload.body);
        } catch (error: any) {
          logger.error(
            { error },
            'error while checking github tree payload for symlinks',
          );
          return emit({
            status: 401,
            body: error.message,
          });
        }
      }

      if (
        gitHubCommitSigningEnabled(config, {
          method: payload.method,
          url: payload.url,
        })
      ) {
        try {
          payload.body = await signGitHubCommit(config, payload.body);
        } catch (error) {
          logger.error({ error }, 'error while signing github commit');
        }
      }

      const req = {
        url: result.url,
        headers: payload.headers,
        method: payload.method,
        body: payload.body,
      };

      // check if this is a streaming request for binary data
      if (payload.streamingID) {
        logger.debug(logContext, 'serving stream request');

        try {
          emit(relayRequest(req), true);
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
      }

      relayRequest(req, (error, response, responseBody) => {
        if (error) {
          logError(logContext, error);
          return emit({
            status: 500,
            body: error.message,
          });
        }

        const contentLength = responseBody.length;
        // Note that the other side of the request will also check the length and will also reject it if it's too large
        // Set to 20MB even though the server is 21MB because the server looks at the total data travelling through the websocket,
        // not just the size of the body, so allow 1MB for miscellaneous data (e.g., headers, Primus overhead)
        const maxLength = parseInt(config.socketMaxResponseLength) || 20971520;
        if (contentLength && contentLength > maxLength) {
          const errorMessage = `body size of ${contentLength} is greater than max allowed of ${maxLength} bytes`;
          logError(logContext, {
            errorMessage,
          });
          return emit({
            status: 502,
            errorType: 'BODY_TOO_LARGE',
            originalBodySize: contentLength,
            body: {
              message: errorMessage,
            },
          });
        }

        const status = (response && response.statusCode) || 500;
        if (config.RES_BODY_URL_SUB && isJson(response.headers)) {
          const replaced = replaceUrlPartialChunk(responseBody, null, config);
          responseBody = replaced.newChunk;
        }
        logResponse(logContext, status, response, config);
        emit({ status, body: responseBody, headers: response.headers });
      });
    });
  };
};

function isJson(responseHeaders) {
  return responseHeaders['content-type']
    ? responseHeaders['content-type'].includes('json')
    : false;
}

function logResponse(logContext, status, response, config) {
  logContext.responseStatus = status;
  logContext.responseHeaders = response.headers;
  logContext.responseBody =
    config && config.LOG_ENABLE_BODY === 'true' ? response.body : null;

  logger.info(logContext, 'sending response back to websocket connection');
}

function logError(logContext, error) {
  logger.error(
    {
      ...logContext,
      error,
      stackTrace: new Error('stacktrace generator').stack,
    },
    'error while sending websocket request over HTTP connection',
  );
}
