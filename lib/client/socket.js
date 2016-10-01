const debug = require('debug')('broker:client');
const Primus = require('primus');
const relay = require('../relay');
const httpErrors = require('../http-errors');
const Socket = Primus.createSocket({
  transformer: 'engine.io',
  parser: 'EJSON',
  plugin: {
    'emitter': require('primus-emitter'),
  }
});

module.exports = ({ url, id, filters, config }) => {
  if (!id) { // null, undefined, empty, etc.
    debug('missing client id');
    const error = new ReferenceError('BROKER_ID is required to successfully identify itself to the server');
    error.code = 'MISSING_BROKER_ID';
    throw error;
  }

  if (!url) { // null, undefined, empty, etc.
    debug('missing broker url');
    const error = new ReferenceError('BROKER_URL is required to connect to the broker server');
    error.code = 'MISSING_BROKER_URL';
    throw error;
  }

  const io = new Socket(url);

  debug('connecting to %s', url);

  const response = relay.response(filters, config);

  // RS note: this bind doesn't feel right, it feels like a sloppy way of
  // getting the filters into the request function.
  io.on('request', response(id));
  io.on('error', ({ type, description }) => {
    if (type === 'TransportError') {
      console.error(`Failed to connect to broker server: ${httpErrors[description]}`);
    }
  });
  io.on('open', () => {
    debug('identifying as %s on %s', id, url);
    io.send('identify', id);
  });

  // only required if we're manually opening the connection
  // io.open();

  return io;
};
