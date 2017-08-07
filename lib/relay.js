const request = require('request');
const undefsafe = require('undefsafe');
const parse = require('url').parse;
const format = require('url').format;
const Filters = require('./filters');
const replace = require('./replace-vars');
const tryJSONParse = require('./try-json-parse');
const logger = require('./log');

module.exports = {
  request: requestHandler,
  response: responseHandler,
};

function requestHandler(filterRules) {
  const filters = Filters(filterRules);

  return (req, res) => {
    filters(req, (error, result) => {
      if (error) {
        logger.info({ method: req.method, url: req.url }, 'blocked');
        return res.status(401).send(error.message);
      }

      req.url = result;
      logger.info({ url: req.url }, 'send socket request');

      // send the socket request containing the http request we're after
      res.locals.io.send('request', {
        url: req.url,
        method: req.method,
        body: req.body,
        headers: req.headers,
      }, response => {
        logger.info({
          method: req.method,
          url: req.url,
          status: response.status,
        }, 'response');
        const resp = res
          .status(response.status)
          .set(response.headers);

        // keep chunked http requests without content-length header
        if (undefsafe(response, 'headers.transfer-encoding') === 'chunked') {
          resp.write(response.body);
          return resp.end();
        }
        resp.send(response.body);
      });
    });
  };
}

function responseHandler(filterRules, config) {
  const filters = Filters(filterRules);

  return (brokerToken) => ({ url, headers, method, body = null } = {}, emit) => {
    // run the request through the filter
    logger.info({ method, url, headers }, 'request captured');
    filters({ url, method, body, headers }, (error, result) => {
      if (error) {
        logger.info({ method, url }, 'blocked');
        return emit({
          status: 401,
          body: error.message,
        });
      }

      logger.info({ result }, 'requesting');
      if (result.startsWith('http') === false) {
        result = 'https://' + result;
      }

      if (!headers['user-agent']) {
        headers['user-agent'] = 'Snyk Broker';
      }

      const parsed = parse(result);
      const auth = parsed.auth;

      if (auth) {
        // if URL contains basic auth,
        // remove authorization header to prefer auth on the URL.
        if (auth.includes(':')) {
          delete headers.authorization;
        }

        // if URL contains token auth,
        // put the token in the authorization header
        // instead of on the URL.
        else {
          headers.authorization = `token ${auth}`;
          // then strip from the url
          delete parsed.auth;
          result = format(parsed);
        }
      }

      // if the request is all good - and at this point it is, we'll check
      // whether we want to do variable substitution on the body
      if (body) {
        const parsedBody = tryJSONParse(body);

        if (parsedBody.BROKER_VAR_SUB) {
          logger.info({ bodyVars: parsedBody.BROKER_VAR_SUB }, 'body variable swap');
          for (const path of parsedBody.BROKER_VAR_SUB) {
            let source = undefsafe(parsedBody, path); // get the value
            source = replace(source, config); // replace the variables
            undefsafe(parsedBody, path, source); // put it back in
          }
          body = JSON.stringify(parsedBody);
        }
      }

      // check whether we want to do variable substitution on the headers
      if (headers && headers.BROKER_VAR_SUB) {
        logger.info({ headerVars: headers.BROKER_VAR_SUB }, 'headers variable swap');
        for (const path of headers.BROKER_VAR_SUB.split(',')) {
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

      request({
        url: result,
        headers: headers,
        method,
        body,
        agentOptions: {
          ca: config.caCert, // Optional CA cert
        },
      }, (error, response, body) => {
        logger.info({
          method,
          result,
          status: (response || { statusCode: 500 }).statusCode,
        }, 'handling request');

        if (error) {
          logger.error(error, 'error while handling request');
          return emit({
            status: 500,
            body: error.message
          });
        }


        emit({
          status: response.statusCode,
          body: body,
          headers: response.headers
        });
      });
    });
  };
}
