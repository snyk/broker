const config = require('snyk-config')(__dirname + '/..');

const { camelify, expand } = require('./utils');

// allow the user to define their own configuration
const dotenv = require('dotenv');

// expand allows the user to put environment values in their .env file
expand(dotenv.config({
  silent: true,
  path: process.cwd() + '/.env',
}));

module.exports = Object.assign({}, camelify(config), camelify(process.env));
