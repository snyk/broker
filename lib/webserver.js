const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');

module.exports = ({ key = null, cert = null, http = false } = {}) => {
  const https = http ? require('http') : require('https');
  const app = express();
  app.disable('x-powered-by');
  app.use(bodyParser.json());

  // overload the .listen method to ensure it's using https
  // http://expressjs.com/en/api.html#app.listen
  app.listen = (...args) => {
    const serverArgs = http ? [app] : [{
      key: fs.readFileSync(key),
      cert: fs.readFileSync(cert),
    }, app]

    const server = https.createServer.apply(https, serverArgs);
    return server.listen.apply(server, args);
  };
  return app;
}
