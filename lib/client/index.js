const debug = require('debug')('broker');
const request = require('request');
const Primus = require('primus');
const Socket = Primus.createSocket({
  transformer: 'engine.io',
  parser: 'JSON',
  plugin: {
    'emitter': require('primus-emitter'),
  }
});

module.exports = ({ url, filters }) => {
  console.log('client socket on', url);
  const socket = new Socket('http://localhost:8080');

  // in bound request
  socket.on('request', ({ url, method, body = null } = {}, emit) => {
    // run the request through the filter
    filters({ url, method }, (error, result) => {
      if (error) {
        debug(error.stack);
        return emit({
          status: 400,
          body: error.message,
        });
      }

      debug('requesting %s', result);

      if (url.indexOf('http') !== 0) {
        url = 'https://' + url;
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
            body: error
          });
        }

        emit({
          status: response.statusCode,
          body: body
        });
      });
    });
  });

  return { io: socket };
};
