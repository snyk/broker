const path = require('path');

module.exports = function (args) {
  require('dotenv-safe').config({
    sample: path.resolve(process.cwd(), '.env.example'),
    silent: true,
    path: args.env || false,
  });

  require('../lib/client');
};
