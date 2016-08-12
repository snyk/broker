const config = require('../config');
const client = require('socket.io-client');

module.exports = function (url) {
  const socket = client(url);

  // in bound request
  socket.on('request', data => {
    // validate request
    filters({ url, method: req.method }, res, result => {
      if (result instanceof Error) {
        console.log(result.stack);
        return socket.send({ ok: false, error: result.message });
      }

      console.log('requesting %s', result);

      const body = req.method === 'GET' ? null : req.body;

      if (url.indexOf('http') !== 0) {
        url = 'https://' + url;
      }

      request({
        url: result,
        method: req.method,
        body,
        json: true,
      }, (error, response, body) => {
        if (error) {
          return socket.send({
            ok: false,
            error,
          });
        }

        return socket.send({
          ok: true,
          res: body,
        });
      });

    });
    // then make request if good
  });
};
