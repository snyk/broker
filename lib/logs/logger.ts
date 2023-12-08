import bunyan from 'bunyan';
import escapeRegExp from 'lodash.escaperegexp';
import mapValues from 'lodash.mapvalues';
import { getConfig } from '../common/config/config';

const sanitiseConfigVariable = (raw, variable) =>
  raw.replace(
    new RegExp(escapeRegExp(getConfig()[variable]), 'igm'),
    '${' + variable + '}',
  );

const sanitiseConfigVariables = (raw, variable) => {
  for (const pool of getConfig()[variable]) {
    raw = raw.replace(
      new RegExp(escapeRegExp(pool), 'igm'),
      '${' + variable + '}',
    );
  }

  return raw;
};

const sanitiseConfigValue = (raw, value, text) =>
  raw.replace(value, '${' + text + '}');

// sanitises sensitive values, replacing all occurences with label
export const sanitise = (raw) => {
  if (!raw || typeof raw !== 'string') {
    return raw;
  }
  const config = getConfig();
  if (config.universalBrokerEnabled) {
    for (const key in config.connections) {
      raw = sanitiseConfigValue(
        raw,
        config.connections[key].identifier,
        `${key} identifier`,
      );
    }
  }

  const variables = [
    'BROKER_TOKEN',
    'GITHUB_TOKEN',
    'GITHUB_TOKEN_POOL',
    'BITBUCKET_USERNAME',
    'BITBUCKET_PASSWORD',
    'GITLAB_TOKEN',
    'JIRA_USERNAME',
    'JIRA_PASSWORD',
    'AZURE_REPOS_TOKEN',
    'ARTIFACTORY_URL',
    'CR_CREDENTIALS',
    'CR_AGENT_URL',
    'CR_BASE',
    'CR_USERNAME',
    'CR_PASSWORD',
    'CR_TOKEN',
    'CR_ROLE_ARN',
    'CR_EXTERNAL_ID',
    'CR_REGION',
    'GIT_USERNAME',
    'GIT_PASSWORD',
    'GIT_CLIENT_URL',
    'NEXUS_URL',
    'BASE_NEXUS_URL',
  ];

  for (const variable of variables) {
    // Copies original `raw`, doesn't mutate it.
    // Regexp is case-insensitive, global and multiline matching,
    // this way all occurences are replaced.
    if (config[variable]) {
      raw = sanitiseConfigVariable(raw, variable);
    }

    const pool = `${variable}_POOL`;
    if (config[pool]) {
      raw = sanitiseConfigVariables(raw, pool);
    }
  }

  return raw;
};

function sanitiseObject(obj) {
  return mapValues(obj, (v) => sanitise(v));
}

function sanitiseHeaders(headers) {
  const hdrs = JSON.parse(JSON.stringify(headers));
  if (hdrs.authorization) {
    hdrs.authorization = '${AUTHORIZATION}';
  }
  if (hdrs['X-Broker-Token']) {
    hdrs['X-Broker-Token'] = '${BROKER_TOKEN}';
  }
  if (hdrs['x-broker-token']) {
    hdrs['x-broker-token'] = '${BROKER_TOKEN}';
  }
  return sanitiseObject(hdrs);
}

function serialiseError(error) {
  if (!(error instanceof Error)) {
    return;
  }

  // part of Error.prototype
  const result = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };

  // collect any other fields that may have been added to the error
  Object.keys(error).forEach((key) => (result[key] = error[key]));

  return result;
}

export const log = bunyan.createLogger({
  name: `snyk-broker`,
  serializers: {
    token: sanitise,
    result: sanitise,
    origin: sanitise,
    url: sanitise,
    httpUrl: sanitise,
    ioUrl: sanitise,
    headers: sanitiseHeaders,
    responseHeaders: sanitiseHeaders,
    requestHeaders: sanitiseHeaders,
    err: serialiseError,
    error: serialiseError,
  },
});
type LogLevels = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

log.level((process.env.LOG_LEVEL as LogLevels) || 'info');

// pin sanitation function on the log so it can be used publicly
// log.sanitise = sanitise;
