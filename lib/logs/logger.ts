import bunyan from 'bunyan';
import escapeRegExp from 'lodash.escaperegexp';
import mapValues from 'lodash.mapvalues';
import { getConfig } from '../hybrid-sdk/common/config/config';
import {
  getPluginsConfig,
  getPluginConfigByConnectionKey,
} from '../hybrid-sdk/common/config/pluginsConfig';
import { ConnectionConfig } from '../hybrid-sdk/client/types/config';

const sanitiseConfigVariable = (raw: string, variable: string) =>
  raw.replace(
    new RegExp(escapeRegExp(getConfig()[variable]), 'igm'),
    '${' + variable + '}',
  );

const sanitiseConfigVariables = (raw: string, variable: string) => {
  for (const pool of getConfig()[variable]) {
    raw = raw.replace(
      new RegExp(escapeRegExp(pool), 'igm'),
      '${' + variable + '}',
    );
  }

  return raw;
};

const sanitiseConnectionConfigVariables = (
  raw: string,
  variable: string,
  connections: Record<string, ConnectionConfig>,
  connectionKey: string,
) => {
  for (const cfgVar of Object.keys(connections[connectionKey])) {
    if (cfgVar == variable) {
      raw = raw.replace(
        new RegExp(escapeRegExp(connections[connectionKey][cfgVar]), 'igm'),
        '${' + variable + '}',
      );
    }
  }
  return raw;
};

const sanitiseConnectionContextConfigVariables = (
  raw: string,
  variable: string,
  connections: Record<string, ConnectionConfig>,
  connectionKey: string,
) => {
  if (connections[connectionKey].contexts) {
    const contextKeys = Object.keys(connections[connectionKey].contexts);
    for (const contextKey of contextKeys) {
      for (const cfgVar of Object.keys(
        connections[connectionKey].contexts[contextKey],
      )) {
        if (cfgVar == variable) {
          raw = raw.replace(
            new RegExp(
              escapeRegExp(
                connections[connectionKey].contexts[contextKey][cfgVar],
              ),
              'igm',
            ),
            '${' + variable + '}',
          );
        }
      }
    }
  }

  return raw;
};

const sanitisePluginsConfigVariables = (
  raw: string,
  variable: string,
  pluginConfig: Record<string, unknown>,
) => {
  for (const cfgVar of Object.keys(pluginConfig)) {
    if (cfgVar == variable && typeof pluginConfig[cfgVar] === 'string') {
      raw = raw.replace(
        new RegExp(escapeRegExp(pluginConfig[cfgVar]), 'igm'),
        '${' + variable + '}',
      );
    }
  }
  return raw;
};

const sanitiseConfigValue = (raw: string, value: string, text: string) =>
  raw.replace(value, '${' + text + '}');

// sanitises sensitive values, replacing all occurences with label
export const sanitise = <T>(raw: T) => {
  if (!raw || typeof raw !== 'string') {
    return raw;
  }

  let rawStr: string = raw; // type checked above

  const config = getConfig();
  if (config.universalBrokerEnabled) {
    for (const key in config.connections) {
      rawStr = sanitiseConfigValue(
        rawStr,
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
    'BITBUCKET_PAT',
    'GITLAB_TOKEN',
    'JIRA_USERNAME',
    'JIRA_PASSWORD',
    'JIRA_PAT',
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
    'BASE_NEXUS2_URL',
    'CHECKMARX_PASSWORD',
    'SONARQUBE_API_TOKEN',
  ];
  const universalBrokerConnectionsVariables = [
    ...variables,
    'GITHUB_APP_CLIENT_ID',
  ];
  const universalBrokerPluginsVariables = ['GHA_ACCESS_TOKEN', 'JWT_TOKEN'];

  for (const variable of variables) {
    // Copies original `raw`, doesn't mutate it.
    // Regexp is case-insensitive, global and multiline matching,
    // this way all occurences are replaced.
    if (config[variable]) {
      rawStr = sanitiseConfigVariable(rawStr, variable);
    }

    const pool = `${variable}_POOL`;
    if (config[pool]) {
      rawStr = sanitiseConfigVariables(rawStr, pool);
    }
  }
  if (config.universalBrokerEnabled) {
    for (const variable of universalBrokerConnectionsVariables) {
      for (const connectionKey of Object.keys(config.connections!)) {
        rawStr = sanitiseConnectionConfigVariables(
          rawStr,
          variable,
          config.connections!,
          connectionKey,
        );
        rawStr = sanitiseConnectionContextConfigVariables(
          rawStr,
          variable,
          config.connections!,
          connectionKey,
        );
      }
    }
    for (const variable of universalBrokerPluginsVariables) {
      for (const connectionKey of Object.keys(getPluginsConfig())) {
        rawStr = sanitisePluginsConfigVariables(
          rawStr,
          variable,
          getPluginConfigByConnectionKey(connectionKey),
        );
      }
    }
  }

  return rawStr;
};

function sanitiseObject(obj: Record<string, unknown>) {
  return mapValues(obj, (v: unknown) => sanitise(v));
}
function sanitiseConnection(connection: Record<string, unknown>) {
  const connectionObj = JSON.parse(JSON.stringify(connection));
  return sanitiseObject(connectionObj);
}
function sanitisePlugins(pluginData: Record<string, unknown>) {
  const pluginObj = JSON.parse(JSON.stringify(pluginData));
  return sanitiseObject(pluginObj);
}

function sanitiseHeaders(headers: Record<string, unknown>) {
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

function serialiseError(error: unknown) {
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
  name: 'snyk-broker',
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
    connection: sanitiseConnection,
    err: serialiseError,
    error: serialiseError,
    accessToken: sanitisePlugins,
  },
});
type LogLevels = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

log.level((process.env.LOG_LEVEL as LogLevels) || 'info');

// pin sanitation function on the log so it can be used publicly
// log.sanitise = sanitise;
