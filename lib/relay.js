const request = require('request');
const undefsafe = require('undefsafe');
const parse = require('url').parse;
const format = require('url').format;
const Filters = require('./filters');
const replace = require('./replace-vars');
const tryJSONParse = require('./try-json-parse');

module.exports = {
  request: requestHandler,
  response: responseHandler,
};

function requestHandler(filterRules) {
  const debug = require('debug')('broker:' + (process.env.BROKER_TYPE || 'relay'));
  const filters = Filters(filterRules);

  return (req, res) => {
    filters(req, (error, result) => {
      if (error) {
        debug('blocked %s %s', req.method, req.url);
        return res.status(401).send(error.message);
      }

      const url = parse(result);
      req.url = url.pathname;
      debug('send socket request for', req.url);

      // send the socket request containing the http request we're after
      res.locals.io.send('request', {
        url: req.url, // strip the leading
        method: req.method,
        body: req.body,
        headers: req.headers,
      }, response => {
        debug('%s %s (%s)', req.method, req.url, response.status);
        res.status(response.status)
          .set(response.headers)
          .send(response.body);
      });
    });
  };
}

function responseHandler(filterRules, config) {
  const filters = Filters(filterRules);
  const debug = require('debug')('broker:' + (process.env.BROKER_TYPE || 'relay'));

  return (brokerId) => ({ url, headers, method, body = null } = {}, emit) => {
    // run the request through the filter
    debug('request captured', url, method);
    filters({ url, method, body }, (error, result) => {
      if (error) {
        debug('blocked %s %s', method, url);
        return emit({
          status: 401,
          body: error.message,
        });
      }

      debug('requesting %s', result);
      if (result.startsWith('http') === false) {
        result = 'https://' + result;
      }

      if (!headers['user-agent']) {
        headers['user-agent'] = 'Snyk Broker';
      }

      const parsed = parse(result);
      const auth = parsed.auth;

      // put the token in the authorization header instead of on the URL
      // if it's there.
      if (auth && !auth.includes(':')) {
        headers.authorization = `token ${auth}`;
        // then strip from the url
        delete parsed.auth;
        result = format(parsed);
      }

      // if the request is all good - and at this point it is, we'll check
      // whether we want to do variable substitution on the body
      if (body) {
        const parsedBody = tryJSONParse(body);

        if (parsedBody.BROKER_VAR_SUB) {
          debug('variable swap on ', parsedBody.BROKER_VAR_SUB);
          for (const path of parsedBody.BROKER_VAR_SUB) {
            let source = undefsafe(parsedBody, path); // get the value
            source = replace(source, config); // replace the variables
            undefsafe(parsedBody, path, source); // put it back in
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
      ].map(_ => delete headers[_]);

      Object.assign(headers, {'X-Broker-Id': brokerId});

      request({
        url: result,
        headers: headers,
        method,
        body,
      }, (error, response, body) => {
        debug('%s %s (%s)', method, result, (response || { statusCode: 500 }).statusCode);

        if (error) {
          debug('error: %s', error.message);
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
