const request = require('request');
const undefsafe = require('undefsafe');
const parse = require('url').parse;
const format = require('url').format;
const Filters = require('./filters');
const replace = require('./replace-vars');
const config = require('./config');

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
        res.status(response.status).send(response.body);
      });
    });
  };
}

function responseHandler(filterRules) {
  const filters = Filters(filterRules);
  const debug = require('debug')('broker:' + (process.env.BROKER_TYPE || 'relay'));

  return ({ url, headers, method, body = null } = {}, emit) => {
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
      if (body && body.BROKER_VAR_SUB) {
        debug('variable swap on ', body.BROKER_VAR_SUB);
        for (const path of body.BROKER_VAR_SUB) {
          let source = undefsafe(body, path); // get the value
          source = replace(source, config); // replace the variables
          undefsafe(body, path, source); // put it back in
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

      request({
        url: result,
        headers: headers,
        method,
        body,
        json: true,
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
          body: body
        });
      });
    });
  };
}
