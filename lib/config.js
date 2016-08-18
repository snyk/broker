const config = require('snyk-config')(__dirname + '/..');
const camelcase = require('camelcase');

function camelify(res) {
  return Object.keys(res).reduce((acc, _) => {
    acc[camelcase(_)] = res[_];
    acc[_] = res[_];
    return acc;
  }, {});
}

// FIXME the only reason this is a function is for testing, so let's make this
// simpler so that it's not a function and just a static object, that tests
// can somehow reload.
module.exports = () => {
  // allow the user to define their own configuration
  require('dotenv').config({
    silent: true,
    path: process.cwd() + '/.env',
  });

  // user config has the highest priority
  return Object.assign({}, camelify(config), camelify(process.env));
};
