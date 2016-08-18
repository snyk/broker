const debug = require('debug')('broker:client');
const config = require('../config')();
const handlers = require('./handlers');
const path = require('path');
const Primus = require('primus');
const Socket = Primus.createSocket({
  transformer: 'engine.io',
  parser: 'JSON',
  plugin: {
    'emitter': require('primus-emitter'),
  }
});

module.exports = ({ url, id }) => {
  const filterPath = config.accept ?
    path.resolve(process.cwd(), config.accept) :
    null;

  const filters = require('../filters')(filterPath);

  if (!id) { // null, undefined, empty, etc.
    const error = new ReferenceError('Client ID is required to successfully identify itself to the server');
    error.code = 'MISSING_CLIENT_ID';
    throw error;
  }

  const socket = new Socket(url);


  // RS note: this bind doesn't feel right, it feels like a sloppy way of
  // getting the filters into the request function.
  socket.on('request', handlers.request.bind(null, filters));
  socket.on('error', handlers.error);

  socket.on('open', () => {
    debug('identifying as %s on %s', id, url);
    socket.send('identify', id);
  });

  return { io: socket };
};
