const bunyan = require('bunyan');
const config = require('./config');

// sanitises sensitive values, replacing all occurences with label
function sanitise(raw) {
  if (!raw || typeof raw !== 'string') {
    return raw;
  }

  // Copies original `raw`, doesn't mutate it.
  // Regexp is case-insensitive, global and multiline matching,
  // this way all occurences are replaced.
  if (config.BROKER_TOKEN) {
    raw = raw.replace(new RegExp(config.BROKER_TOKEN, 'igm'), 'BROKER_TOKEN');
  }

  if (config.GITHUB_TOKEN) {
    raw = raw.replace(new RegExp(config.GITHUB_TOKEN, 'igm'), 'GITHUB_TOKEN');
  }

  if (config.BITBUCKET_USERNAME) {
    raw = raw.replace(new RegExp(config.BITBUCKET_USERNAME, 'igm'), 'BITBUCKET_USERNAME');
  }

  if (config.BITBUCKET_PASSWORD) {
    raw = raw.replace(new RegExp(config.BITBUCKET_PASSWORD, 'igm'), 'BITBUCKET_PASSWORD');
  }

  if (config.GITLAB_TOKEN) {
    raw = raw.replace(new RegExp(config.GITLAB_TOKEN, 'igm'), 'GITLAB_TOKEN');
  }

  return raw;
}

const log = bunyan.createLogger({
  name: 'snyk-broker',
  serializers: {
    token: sanitise,
    result: sanitise,
    url: sanitise,
  },
});

log.level(process.env.LOG_LEVEL || 'info');

module.exports = log;
