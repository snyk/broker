const fs = require('fs');
const path = require('path');
const config = require('snyk-config')(__dirname + '/..');

const { expand, camelify } = require('./utils');

// allow the user to define their own configuration
const dotenv = require('dotenv');

dotenv.config({
  silent: true,
  path: process.cwd() + '/.env',
});

expand(process.env);

const res = Object.assign({}, camelify(config), camelify(process.env));

if (res.caCert) {
  res.caCert = fs.readFileSync(path.resolve(process.cwd(), res.caCert));
}

module.exports = res;
