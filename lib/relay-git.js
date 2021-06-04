const request = require('request');
const { v4: uuid } = require('uuid');
const tryJSONParse = require('./try-json-parse');
const logger = require('./log');

const GIT_CLIENT_REDIRECT_PATH = '/snykgit';

module.exports = {
  GIT_CLIENT_REDIRECT_PATH,
  // no requestHandler here because we don't need any special
  // HTTP-to-websocket transformation for git client requests
  response: responseHandler,
};

// 1. Git request coming in over websocket conn (logged)
// 2. Relay over HTTP conn to git client (logged)
// 3. Get response over HTTP conn (logged)
// 4. Send response over websocket conn
function responseHandler(config, io) {
  return (brokerToken) => (
    { url, headers = {}, method, body = null, streamingID = '' } = {},
    emit,
  ) => {
    // removing GIT_CLIENT_REDIRECT_PATH from request url;
    if (url && url.startsWith(GIT_CLIENT_REDIRECT_PATH)) url = url.slice(GIT_CLIENT_REDIRECT_PATH.length);
    const logContext = {
      url,
      method,
      headers,
      requestId: headers['snyk-request-id'] || uuid(),
      streamingID,
    };

    logger.debug(logContext, 'received request over websocket connection');

    const { GIT_CLIENT_URL, GIT_URL, GIT_USERNAME, GIT_PASSWORD } = config;
    let errorStatus;
    if (brokerToken) errorStatus = 'NO_GIT_CLIENT_ON_BROKER_SERVER';
    else if (!GIT_CLIENT_URL) errorStatus = 'MISSING_GIT_CLIENT_URL';
    else if (!GIT_URL || !GIT_USERNAME || !GIT_PASSWORD) errorStatus = 'MISSING_GIT_SERVER_CONFIG';
    if (errorStatus) {
      logger.error(
        { ...logContext, errorStatus },
        'received git client request with wronng configuration'
      );
      return emit({
        status: 500,
        body: errorStatus,
      });
    }

    // injecting scm url and credentials in the request body
    if (body) {
      const parsedBody = tryJSONParse(body);
      if (parsedBody.key && parsedBody.key.gitURI) {
        // Using schema separator '://' to inject scm url in the right place
        parsedBody.key.gitURI = parsedBody.key.gitURI.replace(/:\/\/[^\/]+/, `://${GIT_URL}`);
        parsedBody.key.creds = {
          username: GIT_USERNAME,
          password: GIT_PASSWORD,
        }
        body = JSON.stringify(parsedBody);
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
    ].map((_) => delete headers[_]);
    logger.debug(logContext, 'sending websocket request over HTTP connection');
    const req = {
      url: `${GIT_CLIENT_URL}${url}`,
      headers,
      method,
      body,
      agentOptions: {
        ca: config.caCert, // Optional CA cert
      },
    };
    request(req, (error, response, responseBody) => {
      if (error) {
        logError(logContext, error);
        return emit({
          status: 500,
          body: error.message,
        });
      }
      const status = (response && response.statusCode) || 500;
      logResponse(logContext, status, response, config);
      emit({ status, body: responseBody, headers: response.headers });
    });
  };
}

function logResponse(logContext, status, response, config = null) {
  logContext.httpStatus = status;
  logContext.httpHeaders = response.headers;
  logContext.httpBody = config && config.LOG_ENABLE_BODY === 'true' ? response.body : null;
  logger.info(logContext, 'sending git client response back to websocket connection');
}

function logError(logContext, error) {
  logContext.error = error;
  logger.error(
    logContext,
    'error while sending websocket request to git client over HTTP connection',
  );
}
