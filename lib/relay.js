const request = require('request');
const Filters = require('./filters');
const parse = require('url').parse;
const format = require('url').format;

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
        return res.status(401).send(error);
      }

      const url = parse(result);
      req.url = url.pathname;
      debug('send socket request for', req.url);

      // send the socket request containing the http request we're after
      res.locals.io.send('request', {
        url: req.url, // strip the leading
        method: req.method,
        body: req.body,
        headers: {
          'user-agent': req.headers['user-agent'],
          authorization: req.headers.authorization,
        },
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
          status: 400,
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
