const debug = require('debug')('broker:request');
const request = require('request');
const path = require('path');

module.exports = (filterPath) => {
  const config = require('./config')();

  if (!filterPath && config.accept) {
    filterPath = path.resolve(process.cwd(), config.accept);
  }

  const filters = require('./filters')(filterPath);

  return ({ url, method, body = null } = {}, emit) => {
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
};
