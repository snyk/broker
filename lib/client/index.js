const relay = require('../relay');
const socket = require('./socket');

module.exports = ({ url, id, app }) => {
  const io = socket({ url, id });

  app.all('/*', (req, res, next) => {
    res.locals.io = io;
    next();
  }, relay.request);

  return { io };
};
