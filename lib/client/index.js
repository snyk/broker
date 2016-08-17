const debug = require('debug')('broker:client');
const request = require('request');
const Primus = require('primus');
const Socket = Primus.createSocket({
  transformer: 'engine.io',
  parser: 'JSON',
  plugin: {
    'emitter': require('primus-emitter'),
  }
});

module.exports = ({ url, id = 'REMY-TEST', filters }) => {
  const socket = new Socket(url);

  socket.on('error', error => console.error(error.stack));
  socket.send('identify', id);
  debug('identify as %s on %s', id, url);

  // inbound request
  socket.on('request', ({ url, method, body = null } = {}, emit) => {
    // run the request through the filter
    debug('request captured', url, method);
    filters({ url, method }, (error, result) => {
      if (error) {
        debug(error.stack);
        return emit({
          status: 400,
          body: error.message,
        });
      }

      debug('requesting %s', result);

      if (url.startsWith('http') === false) {
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
