const debug = require('debug')('broker');
const request = require('request');
const path = require('path');

module.exports = {
  request: requestHandler,
  response: responseHandler,
};

function requestHandler(req, res) {
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
    console.log('%s %s (%s)', req.method, req.url, response.status);
    res.status(response.status).send(response.body);
  });
}

function responseHandler(filterPath) {
  const config = require('./config');

  if (!filterPath && config.accept) {
    filterPath = path.resolve(process.cwd(), config.accept);
  }

  const filters = require('./filters')(filterPath);

  return ({ url, headers, method, body = null } = {}, emit) => {
    // run the request through the filter
    debug('request captured', url, method);
    filters({ url, method }, (error, result) => {
      if (error) {
        return emit({
          status: 400,
          body: error.message,
        });
      }

      debug('requesting %s', result);
      if (result.startsWith('http') === false) {
        result = 'https://' + result;
      }

      request({
        url: result,
        headers: headers,
        method,
        body,
        json: true,
      }, (error, response, body) => {
        if (error) {
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
