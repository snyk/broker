let request = require('request');
const undefsafe = require('undefsafe');
const parse = require('url').parse;
const format = require('url').format;
const { v4: uuid } = require('uuid');
const Filters = require('./filters');
const { replace, replaceUrlPartialChunk } = require('./replace-vars');
const tryJSONParse = require('./try-json-parse');
const logger = require('./log');
const version = require('./version');
const { maskToken } = require('./token');
const stream = require('stream');
const NodeCache = require('node-cache');
const metrics = require('./metrics');
const config = require('./config');
const { BrokerServerPostResponseHandler } = require('./stream-posts');
const { createCommitSignature } = require('./client/scm/utils');

const RequestClass = request.Request;
request = request.defaults({
  ca: config.caCert,
  timeout: 60000,
  agentOptions: {
    keepAlive: true,
    keepAliveMsecs: 60000,
    maxTotalSockets: 1000,
  },
});

class StreamResponseHandler {
  streamingID;
  streamBuffer;
  response;
  streamSize = 0;

  static create(streamingID) {
    const stream = streams.get(streamingID);
    if (!stream) {
      return null;
    }
    const { streamBuffer, response } = stream;

    return new StreamResponseHandler(streamingID, streamBuffer, response);
  }

  constructor(streamingID, streamBuffer, response) {
    this.streamingID = streamingID;
    this.streamBuffer = streamBuffer;
    this.response = response;
  }

  writeStatusAndHeaders = (statusAndHeaders) => {
    this.response.status(statusAndHeaders.status).set(statusAndHeaders.headers);
  };

  writeChunk = (chunk, waitForDrainCb) => {
    this.streamSize += chunk.length;
    if (!this.streamBuffer.write(chunk) && waitForDrainCb) {
      waitForDrainCb(this.streamBuffer);
    }
  };

  finished = () => {
    this.streamBuffer.end();
    streams.del(this.streamingID);
    metrics.observeResponseSize({
      bytes: this.streamSize,
      isStreaming: true,
    });
  };

  destroy = (error) => {
    this.streamBuffer.destroy(error);
    streams.del(this.streamingID);
  };
}

module.exports = {
  request: forwardHttpRequest,
  response: forwardWebSocketRequest,
  streamingResponse: streamResponseHandler,
  StreamResponseHandler: StreamResponseHandler,
};

const streams = new NodeCache({
  stdTTL: parseInt(config.cacheExpiry) || 3600, // 1 hour
  checkperiod: parseInt(config.cacheCheckPeriod) || 60, // 1 min
  useClones: false,
});

/**
 * @deprecated Deprecated in favour of {@link StreamResponseHandler} */
function streamResponseHandler(token) {
  return (streamingID, chunk, finished, ioResponse) => {
    const streamFromId = streams.get(streamingID);

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
          metrics.observeResponseSize({
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
}

// 1. Request coming in over HTTP conn (logged)
// 2. Filter for rule match (log and block if no match)
// 3. Relay over websocket conn (logged)
// 4. Get response over websocket conn (logged)
// 5. Send response over HTTP conn
function forwardHttpRequest(filterRules) {
  const filters = Filters(filterRules);

  return (req, res) => {
    // If this is the server, we should receive a Snyk-Request-Id header from upstream
    // If this is the client, we will have to generate one
    req.headers['snyk-request-id'] ||= uuid();
    const logContext = {
      url: req.url,
      requestMethod: req.method,
      requestHeaders: req.headers,
      requestId: req.headers['snyk-request-id'],
      maskedToken: req.maskedToken,
    };

    logger.info(logContext, 'received request over HTTP connection');
    filters(req, (error, result) => {
      if (error) {
        metrics.incrementHttpRequestsTotal(true);
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
      metrics.incrementHttpRequestsTotal(false);

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
              metrics.observeResponseSize({
                bytes: responseBodyBytes,
                isStreaming: false,
              });
            } else {
              // fallback metric to let us know if we're recording all response sizes
              // we expect to remove this should it report 0
              metrics.incrementUnableToSizeResponse();
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
}

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

// 1. Request coming in over websocket conn (logged)
// 2. Filter for rule match (log and block if no match)
// 3. Relay over HTTP conn (logged)
// 4. Get response over HTTP conn (logged)
// 5. Send response over websocket conn
function forwardWebSocketRequest(filterRules, config, io, serverId) {
  const filters = Filters(filterRules);

  return (brokerToken) =>
    (
      { url, headers = {}, method, body = null, streamingID = '' } = {},
      emit,
    ) => {
      const requestId = headers['snyk-request-id'];
      const logContext = {
        url,
        requestMethod: method,
        requestHeaders: headers,
        requestId,
        streamingID,
        maskedToken: maskToken(brokerToken),
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
      emit = (responseData) => {
        // This only works client -> server, it's not possible to post data server -> client
        delete logContext.requestMethod;
        delete logContext.requestHeaders;
        if (io?.capabilities?.includes('receive-post-streams')) {
          const postHandler = new BrokerServerPostResponseHandler(
            logContext,
            config,
            brokerToken,
            streamingID,
            serverId,
            requestId,
          );
          if (responseData instanceof RequestClass) {
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
          if (streamingID) {
            if (responseData instanceof RequestClass) {
              legacyStreaming(
                logContext,
                responseData,
                config,
                io,
                streamingID,
              );
            } else {
              io.send('chunk', streamingID, '', false, {
                status: responseData.status,
                headers: responseData.headers,
              });
              io.send(
                'chunk',
                streamingID,
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

      filters({ url, method, body, headers }, async (filterError, result) => {
        if (filterError) {
          metrics.incrementWebSocketRequestsTotal(true);
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
              url,
            },
          });
        }
        metrics.incrementWebSocketRequestsTotal(false);

        if (result.url.startsWith('http') === false) {
          result.url = 'https://' + result.url;
          logContext.resultUrlSchemeAdded = true;
        }

        logContext.httpUrl = result.url;

        if (!headers['user-agent']) {
          headers['user-agent'] = 'Snyk Broker ' + version;
          logContext.userAgentHeaderSet = true;
        }

        if (result.auth) {
          headers.authorization = result.auth;
          logContext.authHeaderSetByRuleAuth = true;
        } else {
          const parsed = parse(result.url);
          if (parsed.auth) {
            // if URL contains basic auth,
            // remove authorization header to prefer auth on the URL.
            if (parsed.auth.includes(':')) {
              delete headers.authorization;
            }

            // if URL contains token auth,
            // put the token in the authorization header
            // instead of on the URL.
            else {
              headers.authorization = `token ${parsed.auth}`;
              // then strip from the url
              delete parsed.auth;
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
        if (body) {
          const parsedBody = tryJSONParse(body);

          if (parsedBody.BROKER_VAR_SUB) {
            logContext.bodyVarsSubstitution = parsedBody.BROKER_VAR_SUB;
            for (const path of parsedBody.BROKER_VAR_SUB) {
              let source = undefsafe(parsedBody, path); // get the value
              source = replace(source, config); // replace the variables
              undefsafe(parsedBody, path, source); // put it back in
            }
            body = JSON.stringify(parsedBody);
          }
        }

        // check whether we want to do variable substitution on the headers
        if (headers && headers['x-broker-var-sub']) {
          logContext.headerVarsSubstitution = headers['x-broker-var-sub'];
          for (const path of headers['x-broker-var-sub'].split(',')) {
            let source = undefsafe(headers, path.trim()); // get the value
            source = replace(source, config); // replace the variables
            undefsafe(headers, path.trim(), source); // put it back in
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
        ].map((_) => delete headers[_]);

        if (config.removeXForwardedHeaders === 'true') {
          for (let key in headers) {
            if (key.startsWith('x-forwarded-')) {
              delete headers[key];
            }
          }

          if (headers['forwarded']) {
            delete headers['forwarded'];
          }
        }

        if (brokerToken && io?.socketType === 'server') {
          Object.assign(headers, { 'X-Broker-Token': brokerToken });
        }

        logger.debug(
          logContext,
          'sending websocket request over HTTP connection',
        );

        // Sometimes we receive the body as a {type, data} object
        // Unsure why - possibly Primus?
        if (body?.type === 'Buffer') body = Buffer.of(body.data);

        // Request library is buggy and will throw an error if we're POST'ing an empty body without an explicit Content-Length header
        if (!body || body.length === 0) {
          headers['Content-Length'] = '0';
        }

        headers['connection'] = 'Keep-Alive';
        headers['Keep-Alive'] = 'timeout=60, max=1000';

        if (
          method == 'PUT' &&
          url.includes('/contents/') &&
          config.COMMIT_SIGNING_PRIVATE_KEY &&
          config.COMMIT_SIGNING_PRIVATE_KEY_PASSPHRASE
        ) {
          logger.debug(logContext, 'Signing commit');
          const signature = await createCommitSignature(
            body,
            config.COMMIT_SIGNING_PRIVATE_KEY,
            config.COMMIT_SIGNING_PRIVATE_KEY_PASSPHRASE,
          );
          body.signature = signature;
        }

        const req = {
          url: result.url,
          headers: headers,
          method,
          body,
        };

        // check if this is a streaming request for binary data
        if (streamingID) {
          logger.debug(logContext, 'serving stream request');

          try {
            emit(request(req));
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

        request(req, (error, response, responseBody) => {
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
          const maxLength =
            parseInt(config.socketMaxResponseLength) || 20971520;
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
}

function isJson(responseHeaders) {
  return responseHeaders['content-type']
    ? responseHeaders['content-type'].includes('json')
    : false;
}

function logResponse(logContext, status, response, config = null) {
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
