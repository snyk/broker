const debug = require('debug')('broker:client');
const Primus = require('primus');
const Socket = Primus.createSocket({
  transformer: 'engine.io',
  parser: 'JSON',
  plugin: {
    'emitter': require('primus-emitter'),
  }
});

module.exports = ({ url, id, app }) => {
  if (!id) { // null, undefined, empty, etc.
    debug('missing client id');
    const error = new ReferenceError('Client ID is required to successfully identify itself to the server');
    error.code = 'MISSING_CLIENT_ID';
    throw error;
  }

  const io = new Socket(url);

  debug('connecting to %s', url);

  // RS note: this bind doesn't feel right, it feels like a sloppy way of
  // getting the filters into the request function.
  io.on('request', require('../proxy-request')());
  io.on('error', error => console.error(error));
  io.on('open', () => {
    debug('identifying as %s on %s', id, url);
    io.send('identify', id);
  });

  app.all('/*', (req, res) => {
    debug('forwarding request for %s %s', req.method, req.url);
    io.send('request', {
      url: req.url,
      method: req.method,
      body: req.body,
      headers: {
        authorization: req.headers.authorization,
        'user-agent': req.headers['user-agent'],
        'x-broker-id': id,
      }
    }, response => {
      res.status(response.status).send(response.body);
    });
  });

  return { io };
};
