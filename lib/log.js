const bunyan = require('bunyan');
const log = bunyan.createLogger({name: 'snyk-broker', src: true});

if (process.env.CI == 1) {
  log.level('warn');
}

module.exports = log;
