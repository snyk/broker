import bunyan from 'bunyan';
import escapeRegExp from 'lodash.escaperegexp';
import mapValues from 'lodash.mapvalues';
import { getConfig } from '../hybrid-sdk/common/config/config';
import {
  getPluginsConfig,
  getPluginConfigByConnectionKey,
} from '../hybrid-sdk/common/config/pluginsConfig';
import {
  COMMON_CREDENTIAL_ENV_VARS,
  PER_CONNECTION_CREDENTIAL_ENV_VARS,
  PER_PLUGIN_CREDENTIAL_ENV_VARS,
  CREDENTIAL_KEY_PATTERN,
} from './redact';

// Pre-compute the per-connection list once at module load, not per sanitise()
// call. Universal-broker connections inherit the top-level credential names
// plus a few connection-only ones.
const universalBrokerConnectionsVariables: readonly string[] = [
  ...COMMON_CREDENTIAL_ENV_VARS,
  ...PER_CONNECTION_CREDENTIAL_ENV_VARS,
];

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
  connections,
  connectionKey,
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
  connections,
  connectionKey,
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
  pluginConfig,
) => {
  for (const cfgVar of Object.keys(pluginConfig)) {
    if (cfgVar == variable) {
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

  // String-based allowlist: when `config[var]` is set, this sanitiser replaces
  // every occurrence of its *value* in the serialised log string with
  // `${VAR_NAME}`. It does NOT walk arbitrary nested objects — call sites
  // that log credential-bearing objects must wrap them with `redactConfig`
  // from ./redact.ts first. Names live in ./redact.ts so both layers share
  // one source of truth; the groupings keep per-record work bounded.
  const variables = COMMON_CREDENTIAL_ENV_VARS;
  const universalBrokerPluginsVariables = PER_PLUGIN_CREDENTIAL_ENV_VARS;

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
  if (config.universalBrokerEnabled) {
    for (const variable of universalBrokerConnectionsVariables) {
      for (const connectionKey of Object.keys(config.connections)) {
        raw = sanitiseConnectionConfigVariables(
          raw,
          variable,
          config.connections,
          connectionKey,
        );
        raw = sanitiseConnectionContextConfigVariables(
          raw,
          variable,
          config.connections,
          connectionKey,
        );
      }
    }
    for (const variable of universalBrokerPluginsVariables) {
      for (const connectionKey of Object.keys(getPluginsConfig())) {
        raw = sanitisePluginsConfigVariables(
          raw,
          variable,
          getPluginConfigByConnectionKey(connectionKey),
        );
      }
    }
  }

  return raw;
};

function sanitiseObject(obj) {
  return mapValues(obj, (v) => sanitise(v));
}
function sanitiseConnection(connection) {
  if (typeof connection === 'string') {
    return sanitise(connection);
  }
  const connectionObj = JSON.parse(JSON.stringify(connection));
  return sanitiseObject(connectionObj);
}
function sanitisePlugins(pluginData) {
  const pluginObj = JSON.parse(JSON.stringify(pluginData));
  return sanitiseObject(pluginObj);
}

function sanitiseHeaders(headers) {
  const hdrs = JSON.parse(JSON.stringify(headers));

  // Iterate through all headers and sanitize those matching credential patterns
  for (const key in hdrs) {
    if (hdrs.hasOwnProperty(key)) {
      const lowerKey = key.toLowerCase();

      // Check if the header name matches known credential patterns
      if (CREDENTIAL_KEY_PATTERN.test(key)) {
        // Only sanitize if the value is truthy (preserve empty/falsy values for debugging)
        if (hdrs[key]) {
          hdrs[key] = '${' + key.toUpperCase().replace(/-/g, '_') + '}';
        }
      }
      // Explicit handling for common authentication headers (case-insensitive)
      else if (lowerKey === 'authorization') {
        if (hdrs[key]) {
          hdrs[key] = '${AUTHORIZATION}';
        }
      } else if (lowerKey === 'x-broker-token') {
        if (hdrs[key]) {
          hdrs[key] = '${BROKER_TOKEN}';
        }
      }
    }
  }

  return sanitiseObject(hdrs);
}

// Exported for unit testing. The bunyan serializers below pass this by
// reference, so changing the export shape is observable in log output.
//
// Circular references in `cause` or any custom property copied below are
// safe at the log-emission boundary: bunyan stringifies records via
// `safe-json-stringify` (with a `safeCycles` fallback), which converts
// any cycle to a "[Circular]" marker rather than throwing. So we copy
// values by reference here without defensive cloning.
export function serialiseError(
  error: unknown,
): Record<string, unknown> | undefined {
  if (!(error instanceof Error)) {
    return;
  }

  // part of Error.prototype
  const result: Record<string, unknown> = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };

  // collect any other fields that may have been added to the error
  Object.keys(error).forEach((key) => (result[key] = (error as any)[key]));

  // Node sets the ES2022 `cause` property as non-enumerable, so the
  // Object.keys() pass above doesn't catch it. Copy it explicitly so
  // catches that wrap a non-Error throwable via `new Error(msg, { cause })`
  // still surface the original value in the log record.
  if ('cause' in error) {
    result.cause = (error as { cause?: unknown }).cause;
  }

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
    errDetails: serialiseError,
    accessToken: sanitisePlugins,
  },
});
type LogLevels = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

log.level((process.env.LOG_LEVEL as LogLevels) || 'info');

// pin sanitation function on the log so it can be used publicly
// log.sanitise = sanitise;
