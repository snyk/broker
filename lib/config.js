const config = require('snyk-config')([__dirname + '/..', process.cwd()]);
const camelcase = require('camelcase');

function camelify(res) {
  return Object.keys(res).reduce((acc, _) => {
    acc[camelcase(_)] = res[_];
    return acc;
  }, {});
}

// user config has the highest priority
module.exports = () => {
  // allow the user to define their own configuration
  require('dotenv').config({
    silent: true,
    path: process.cwd() + '/.env',
  });

  return Object.assign({}, camelify(config), camelify(process.env));
};
