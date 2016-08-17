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

// FIXME id is hard coded
module.exports = ({ url, id = 'REMY-TEST', filters }) => {
  const socket = new Socket(url);

  socket.on('error', error => console.error(error.stack));
  socket.send('identify', id);
  debug('identifying as %s on %s', id, url);

  // inbound request
  socket.on('request', ({ url, method, body = null } = {}, emit) => {
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
  });

  return { io: socket };
};
