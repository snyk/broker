const config = require('../config');
const client = require('socket.io-client');

module.exports = function (url) {
  const socket = client(url);

  // in bound request
  socket.on('request', data => {
    // validate request

    // then make request if good
  });
};
