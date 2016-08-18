const debug = require('debug')('broker:client');
const request = require('request');

module.exports = {
  request: requestHandler,
  error: error => console.error(error.stack), // simple enough
};

function requestHandler(filters, { url, method, body = null } = {}, emit) {
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
}
