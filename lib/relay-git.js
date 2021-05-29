const request = require('request');
const { v4: uuid } = require('uuid');
const tryJSONParse = require('./try-json-parse');
const logger = require('./log');

module.exports = {
  request: requestHandler,
};

function requestHandler(config) {
  return (req, res) => {
    const logContext = {
      url: req.url,
      method: req.method,
      headers: req.headers,
      requestId: req.headers['snyk-request-id'] || uuid(),
    };
    const { GIT_CLIENT_URL, GIT_CLIENT_CREDENTIALS } = config;
    if (!GIT_CLIENT_URL || !GIT_CLIENT_CREDENTIALS) {
      logger.error(
        { ...logContext, GIT_CLIENT_URL, GIT_CLIENT_CREDENTIALS },
        'received git request with no configuration for git client'
      );
      return res.status(500).json({ error: gitClientUrl ? 'MISSING_GIT_CLIENT_CREDENTIALS' : 'MISSING_GIT_CLIENT_URL'});
    }
    logger.debug(logContext, 'received git request over HTTP connection');
    // remove headers that we don't want to relay
    // (because they corrupt the request)
    [
      'x-forwarded-for',
      'x-forwarded-proto',
      'content-length',
      'host',
      'accept-encoding',
    ].map((_) => delete req.headers[_]);
    const reqObj = {
      url: `${GIT_CLIENT_URL}${req.url}`,
      method: req.method,
      headers: req.headers,
      body: req.body,
    }
    // injecting credentials in the analyze request body
    if (req.body && isJson(req.headers) && req.url === '/analyze') {
      const parsedBody = tryJSONParse(req.body);
      parsedBody.url = parsedBody.url && parsedBody.url.replace("://", `://${GIT_CLIENT_CREDENTIALS}@`);
      reqObj.body = JSON.stringify(parsedBody);
    }
    request(reqObj, (error, response, responseBody) => {
      if (error) {
        logError(logContext, error);
        return res.status(500).json({ error: error.message });
      }
      const status = (response && response.statusCode) || 500;
      logResponse(logContext, status, response, config);
      return res.status(status).json(responseBody);
    });
  };
}

function isJson(headers) {
  return headers['content-type'] ? headers['content-type'].includes('json') : false;
}

function logResponse(logContext, status, response, config = null) {
  logContext.httpStatus = status;
  logContext.httpHeaders = response.headers;
  logContext.httpBody =
    config && config.LOG_ENABLE_BODY === 'true' ? response.body : null;

  logger.info(logContext, 'sending git response back to websocket connection');
}

function logError(logContext, error) {
  logContext.error = error;
  logger.error(
    logContext,
    'error while sending websocket git request over HTTP connection',
  );
}
