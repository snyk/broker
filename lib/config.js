const config = require('snyk-config')(__dirname + '/..');
const camelcase = require('camelcase');

// allow the user to define their own configuration
require('dotenv').config({
  silent: true,
  path: process.cwd() + '/.env',
});;

function camelify(res) {
  return Object.keys(res).reduce((acc, _) => {
    acc[camelcase(_)] = res[_];
    acc[_] = res[_];
    return acc;
  }, {});
}

module.exports = Object.assign({}, camelify(config), camelify(process.env));
