require('clarify');

const config = require('./config');
const client = require('./client');
const fs = require('fs');
const filters = require('./filters')(fs.readFileSync(config.filters, 'utf8'));
const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const app = express();

app.disable('x-powered-by');
app.use(bodyParser.json());

if (config.brokerServer) {
  // connect to server
  client(config.brokerServer);
}

app.all('/broker/:id/*', (req, res, next) => {
  const url = req.url.replace(new RegExp(`^/broker/${req.params.id}`), '');

  filters({ url, method: req.method }, res, result => {
    if (result instanceof Error) {
      console.log(result.stack);
      return res.status(400).send(result.message);
    }

    console.log('requesting %s', result);

    const body = req.method === 'GET' ? null : req.body;

    request({
      url: result,
      method: req.method,
      body,
      json: true,
    }, (error, response, body) => {
      if (error) {
        return res.status(500).send(error);
      }

      return res.status(response.statusCode).send(body);
    });

  });
});

// FIXME always listen securely
app.listen(config.PORT || process.env.PORT || 1337, () => {
  console.log('socket.io server listening');
});
