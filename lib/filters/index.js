const express = require('express');
const config = require('../config');
const interpolate = require('./interpolate');

// reads config that defines
module.exports = function (rules, success) {
  const router = express.Router();

  if (typeof rules !== 'string') {
    throw new Error(`unsupported type (${typeof rules}) for filter rules`);
  }

  // expects rules to be string of lines: `GET <url>\nPOST <url>\nDEL …`
  rules.trim().split('\n').forEach(line => {
    let [method, url] = line.split(' ', 2).map(_ => _.trim());
    // ensure we start with a slash
    if (url[0] !== '/') {
      url = '/' + url;
    }

    url = interpolate(url, config);
    config.host = 'localhost:8000'
    console.log(`${method} - ${url}`);

    router.route(url)[method.toLowerCase()]((req, res, next) => {
      next(req.url.substr(1));
    });
  });

  router.route('*').all((req, res, next) => {
    next(new Error('blocked'));
  });

  return router;
};

function tag(strings, ...values) {
  console.log(strings);
  console.log(values);

  return strings;
}
