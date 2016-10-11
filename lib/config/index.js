const config = require('snyk-config')(__dirname + '/..');

const { camelify } = require('./utils');

// allow the user to define their own configuration
const dotenv = require('dotenv');
const dotenvExpand = require('dotenv-expand');

dotenv.config({
  silent: true,
  path: process.cwd() + '/.env',
});

dotenvExpand(process.env);

const res = Object.assign({}, camelify(config), camelify(process.env));

module.exports = res;
