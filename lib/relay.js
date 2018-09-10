const request = require('request');
const undefsafe = require('undefsafe');
const parse = require('url').parse;
const format = require('url').format;
const uuid = require('uuid/v4');
const Filters = require('./filters');
const replace = require('./replace-vars');
const tryJSONParse = require('./try-json-parse');
const logger = require('./log');

module.exports = {
  request: requestHandler,
  response: responseHandler,
};

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
        logContext.error = error;
        logger.info(logContext, 'no rule match, blocking HTTP request');
        // TODO: respect request headers, block according to content-type
        return res.status(401).send(error.message);
      }

      req.url = result.url;
      logContext.ioUrl = result.url;
      logger.debug(logContext, 'sending request over websocket connection');

      // relay the http request over the websocket, handle websocket response
      res.locals.io.send('request', {
        url: req.url,
        method: req.method,
        body: req.body,
        headers: req.headers,
      }, ioResponse => {
        logContext.ioStatus = ioResponse.status;
        logContext.ioHeaders = ioResponse.headers;
        logger.info(logContext, 'sending response back to HTTP connection');
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
function responseHandler(filterRules, config) {
  const filters = Filters(filterRules);

  return (brokerToken) => ({ url, headers = {}, method, body = null } = {}, emit) => {
    const logContext = {
      url,
      method,
      headers,
      requestId: headers['snyk-request-id'] || uuid(),
    };

    logger.debug(logContext, 'received request over webscoket connection');

    filters({ url, method, body, headers }, (error, result) => {
      if (error) {
        logContext.error = error;
        logger.info(logContext, 'no rule match, blocking websocket request');
        return emit({
          status: 401,
          body: error.message,
        });
      }

      if (result.url.startsWith('http') === false) {
        result.url = 'https://' + result.url;
        logContext.resultUrlSchemeAdded = true;
      }

      logContext.httpUrl = result.url;

      if (!headers['user-agent']) {
        headers['user-agent'] = 'Snyk Broker';
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
      ].map(_ => delete headers[_]);

      if (brokerToken) {
        Object.assign(headers, {'X-Broker-Token': brokerToken});
      }

      logger.debug(logContext, 'sending websocket request over HTTP connection');

      request({
        url: result.url,
        headers: headers,
        method,
        body,
        agentOptions: {
          ca: config.caCert, // Optional CA cert
        },
      }, (error, response, body) => {
        if (error) {
          logContext.error = error;
          logger.error(logContext, 'error while sending websocket request over HTTP connection');
          return emit({
            status: 500,
            body: error.message
          });
        }

        const status = (response && response.statusCode) || 500;
        logContext.httpStatus = status;
        logContext.httpHeaders = response.headers;
        logger.info(logContext, 'sending response back to websocket connection');
        emit({ status, body, headers: response.headers });
      });
    });
  };
}
