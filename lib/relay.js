const request = require('request');
const undefsafe = require('undefsafe');
const parse = require('url').parse;
const format = require('url').format;
const uuid = require('uuid/v4');
const Filters = require('./filters');
const replace = require('./replace-vars');
const tryJSONParse = require('./try-json-parse');
const logger = require('./log');
const version = require('./version');
const stream = require('stream');
const NodeCache = require('node-cache');

module.exports = {
  request: requestHandler,
  response: responseHandler,
  streamingResponse: streamResponseHandler,
};

const streams = new NodeCache({
  stdTTL: 18000,  // 5 hours
  checkperiod: 3600, // 1 hour
  useClones: false
});

function streamResponseHandler(token) {
  return (streamingID, chunk, finished, ioResponse) => {
    const stream = streams.get(streamingID);

    if (stream) {
      const { streamBuffer, response } = stream;

      if (streamBuffer) {
        if (ioResponse) {
          response.status(ioResponse.status)
            .set(ioResponse.headers);
        }
        if (chunk) {
          streamBuffer.write(chunk);
        }
        if (finished) {
          streamBuffer.end();
          streams.del(streamingID);
        }
      } else {
        logger.warn({ streamingID, token }, 'discarding binary chunk');
      }
    } else {
      logger.warn({ streamingID, token }, 'trying to write into a closed stream');
    }
  };
}

// 1. Request coming in over HTTP conn (logged)
// 2. Filter for rule match (log and block if no match)
// 3. Relay over websocket conn (logged)
// 4. Get response over websocket conn (logged)
// 5. Send response over HTTP conn
function requestHandler(filterRules) {
  const filters = Filters(filterRules);

  return (req, res) => {
    const logContext = {
      url: req.url,
      method: req.method,
      headers: req.headers,
      requestId: req.headers['snyk-request-id'] || uuid(),
    };

    logger.debug(logContext, 'received request over HTTP connection');
    filters(req, (error, result) => {
      if (error) {
        const reason = 'Request does not match any accept rule, blocking HTTP request';
        error.reason = reason;
        logContext.error = error;
        logger.warn(logContext, reason);
        // TODO: respect request headers, block according to content-type
        return res
          .status(401)
          .send({ message: error.message, reason, url: req.url });
      }

      req.url = result.url;
      logContext.ioUrl = result.url;

      // check if this is a streaming request for binary data
      if (result.stream) {
        const streamingID = uuid();
        const streamBuffer = new stream.PassThrough();
        logContext.streamingID = streamingID;
        logger.debug(logContext, 'sending stream request over websocket connection');

        streams.set(streamingID, {
          response : res,
          streamBuffer
        });
        streamBuffer.pipe(res);

        res.locals.io.send('request', {
          url: req.url,
          method: req.method,
          body: req.body,
          headers: req.headers,
          streamingID,
        }, () => {
          // Streaming requests should not be handled using the emit function
          // but rather by sending 'chunk' messages
          const msg = 'Broker client does not support streaming requests';
          logger.error(logContext, msg);
          return res.status(501).send({message: msg});
        });

        return;
      }

      logger.debug(logContext, 'sending request over websocket connection');

      // relay the http request over the websocket, handle websocket response
      res.locals.io.send('request', {
        url: req.url,
        method: req.method,
        body: req.body,
        headers: req.headers,
        streamingID : '',
      }, ioResponse => {
        logContext.ioStatus = ioResponse.status;
        logContext.ioHeaders = ioResponse.headers;

        const logMsg = 'sending response back to HTTP connection';
        if (ioResponse.status <= 200) {
          logger.debug(logContext, logMsg);
        } else {
          logger.info(logContext, logMsg);
        }

        const httpResponse = res
          .status(ioResponse.status)
          .set(ioResponse.headers);

        // keep chunked http requests without content-length header
        const isChunked = undefsafe(ioResponse, 'headers.transfer-encoding') === 'chunked';
        if (isChunked) {
          httpResponse.write(ioResponse.body);
          httpResponse.end();
        } else {
          httpResponse.send(ioResponse.body);
        }
      });
    });
  };
}

// 1. Request coming in over websocket conn (logged)
// 2. Filter for rule match (log and block if no match)
// 3. Relay over HTTP conn (logged)
// 4. Get response over HTTP conn (logged)
// 5. Send response over websocket conn
function responseHandler(filterRules, config, io) {
  const filters = Filters(filterRules);

  return (brokerToken) => ({ url, headers = {}, method, body = null, streamingID = '' } = {}, emit) => {
    const logContext = {
      url,
      method,
      headers,
      requestId: headers['snyk-request-id'] || uuid(),
      streamingID,
    };

    logger.debug(logContext, 'received request over webscoket connection');

    filters({ url, method, body, headers }, (error, result) => {
      if (error) {
        const reason = 'Response does not match any accept rule, blocking websocket request';
        logContext.error = error;
        error.reason = reason;
        logger.warn(logContext, reason);
        return emit({
          status: 401,
          body: {
            message: error.message,
            reason,
            url,
          },
        });
      }

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
      ].map(_ => delete headers[_]);

      if (brokerToken) {
        Object.assign(headers, {'X-Broker-Token': brokerToken});
      }

      logger.debug(logContext, 'sending websocket request over HTTP connection');

      var req = {
        url: result.url,
        headers: headers,
        method,
        body,
        agentOptions: {
          ca: config.caCert, // Optional CA cert
        },
      };

      // check if this is a streaming request for binary data
      if (streamingID) {
        logger.debug(logContext, 'serving stream request');

        req.encoding = null; // no encoding for binary data

        request(req).on('response', response => {
          const status = (response && response.statusCode) || 500;
          logResponse(logContext, status, response.headers);
          io.send('chunk', streamingID, '', false, {
            status,
            headers : response.headers
          });
        }).on('data', chunk => {
          io.send('chunk', streamingID, chunk, false);
        }).on('end', () => {
          io.send('chunk', streamingID, '', true);
        }).on('error', error => {
          logError(logContext, error);
          io.send('chunk', streamingID, error.message, true, {
            status : 500
          });
        });
        return;
      }

      request(req, (error, response, body) => {
        if (error) {
          logError(logContext, error);
          return emit({
            status: 500,
            body: error.message
          });
        }

        const status = (response && response.statusCode) || 500;
        logResponse(logContext, status, response.headers);
        emit({ status, body, headers: response.headers });
      });
    });
  };
}

function logResponse(logContext, status, headers) {
  logContext.httpStatus = status;
  logContext.httpHeaders = headers;

  const logMsg = 'sending response back to websocket connection';
  if (status <= 200) {
    logger.debug(logContext, logMsg);
  } else {
    logger.info(logContext, logMsg);
  }
}

function logError(logContext, error) {
  logContext.error = error;
  logger.error(logContext, 'error while sending websocket request over HTTP connection');
}
