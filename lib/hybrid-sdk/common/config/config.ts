import fs from 'fs';
import path from 'path';
import camelcase from 'camelcase';
import { loadConfig } from 'snyk-config';
import dotenv from 'dotenv';
import { log as logger } from '../../../logs/logger';
import { ConnectionConfig } from '../../client/types/config';

type BrokerConfig = Record<string, any> & {
  noProxy?: string;
  connections: Record<string, ConnectionConfig>;
  brokerClientConfiguration?: {
    common: {
      default: Record<string, unknown>;
      required: Record<string, unknown>;
    };
  };
};

let config: BrokerConfig = {
  connections: {},
};

export const getConfig = () => {
  return config;
};
export const setConfig = (newConfig) => {
  config = newConfig;
};

export const setConfigKey = (key: string, value: unknown) => {
  config[key] = value;
};

/**
 * Finds the directory containing config.default.json by walking up the directory tree.
 *
 * Searches upward from the starting directory, checking each parent directory for
 * the presence of `config.default.json`. Returns the first directory that contains
 * this file. This directory is assumed to be the project root, though the function
 * only verifies the file's presence, not that it's actually the project root.
 *
 * @param startDir - The directory path to start searching from (typically __dirname or process.cwd())
 * @returns The absolute path to the directory containing config.default.json
 * @throws {ReferenceError} If config.default.json is not found in any parent directory up to the filesystem root.
 *          The error has a `code` property set to 'MISSING_DEFAULT_CONFIG'.
 */
export const findProjectRoot = (startDir: string): string => {
  let currentDir = startDir;

  while (currentDir !== '/') {
    const snykConfigPath = path.join(currentDir, 'config.default.json');

    if (fs.existsSync(snykConfigPath)) {
      return currentDir;
    }

    currentDir = path.dirname(currentDir);
  }

  const errorMessage =
    'Error: config.default.json is missing, please ensure the file exists when running the broker.';
  const refError = new ReferenceError(errorMessage);
  refError['code'] = 'MISSING_DEFAULT_CONFIG';
  throw refError;
};

export const findFactoryRoot = (startDir: string): string | null => {
  let currentDir = startDir;

  while (currentDir !== '/') {
    const snykConfigPath = path.join(currentDir, 'workloadFactory.js');

    if (fs.existsSync(snykConfigPath)) {
      return currentDir;
    }

    currentDir = path.dirname(currentDir);
  }

  return null;
};

export const findPluginFolder = async (
  dirPath: string,
  targetFolder: string,
): Promise<string | null> => {
  const files = await fs.promises.readdir(dirPath);

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stat = await fs.promises.stat(filePath);

    if (stat.isDirectory()) {
      if (file === targetFolder) {
        return filePath;
      }
      const result = await findPluginFolder(filePath, targetFolder);
      if (result) {
        return result;
      }
    }
  }

  return null;
};

export const loadBrokerConfig = async (localConfigForTest?) => {
  dotenv.config({
    path: path.join(process.cwd(), '.env'),
  });
  try {
    const localConfig = localConfigForTest
      ? localConfigForTest
      : loadConfig(findProjectRoot(__dirname) ?? process.cwd());

    // @ts-expect-error - expand may add string arrays to environment variables,
    // but it's accessed all over the place, so better typing will need to wait
    process.env = expand(process.env);
    config = Object.assign(
      {},
      camelify(localConfig),
      camelify(process.env),
    ) as Record<string, any> & {
      noProxy?: string;
      connections: Record<string, ConnectionConfig>;
    };
    // for each in config.brokerClientConfiguration.common.default check if process env exist and if it does,
    // override config.brokerClientConfiguration.common.default
    // clientOpts.config.brokerClientConfiguration.common.default.BROKER_SERVER_URL = process.env.BROKER_SERVER_URL
    if (config.universalBrokerEnabled) {
      config = getConsolidatedConfigForUniversalBroker(config) as BrokerConfig;
    }
  } catch (error) {
    logger.error({ error }, 'Error loading configuration');
    const refError = new ReferenceError(
      `Error loading configuration. ${error}`,
    );
    refError['code'] = 'UNABLE_TO_LOAD_CONFIGURATION';
    throw refError;
  }

  if (config.caCert) {
    config.caCert = fs.readFileSync(
      path.resolve(process.cwd(), config.caCert as string),
    );
  }

  for (const [key, value] of Object.entries(config)) {
    if (
      (key.endsWith('Pool') || key.endsWith('_POOL')) &&
      !Array.isArray(value) &&
      typeof value === 'string'
    ) {
      config[key] = value.split(',').map((s) => s.trim());
    }
  }
  return;
};

const getConsolidatedConfigForUniversalBroker = (configToConsolidate: {
  brokerClientConfiguration?: { common: { default: Record<string, unknown> } };
  brokerClientUrl?: string;
}) => {
  const commonDefaultConfigKeys = Object.keys(
    configToConsolidate.brokerClientConfiguration!.common.default,
  );
  for (let i = 0; i < commonDefaultConfigKeys.length; i++) {
    // override default values with any env var override for the common settings
    configToConsolidate.brokerClientConfiguration!.common.default[
      commonDefaultConfigKeys[i]
    ] =
      process.env[commonDefaultConfigKeys[i]] ||
      configToConsolidate.brokerClientConfiguration!.common.default[
        commonDefaultConfigKeys[i]
      ];

    // Moving common settings only to config level like classic broker
    configToConsolidate[commonDefaultConfigKeys[i]] =
      configToConsolidate.brokerClientConfiguration!.common.default[
        commonDefaultConfigKeys[i]
      ];
  }
  // share the broker client url across the connections requiring it
  if (configToConsolidate.brokerClientUrl) {
    const brokerClientConfigurationKeys = Object.keys(
      configToConsolidate.brokerClientConfiguration!,
    );
    for (const key of brokerClientConfigurationKeys) {
      if (
        configToConsolidate.brokerClientConfiguration![key].required
          .BROKER_CLIENT_URL
      ) {
        configToConsolidate.brokerClientConfiguration![
          key
        ].default.BROKER_CLIENT_URL = configToConsolidate.brokerClientUrl;
      }
    }
  }
  return camelify(configToConsolidate);
};

/**
 * Converts object keys to camelCase while preserving original keys.
 *
 * @param res - The input object whose keys should be camelified
 * @returns A new object containing both original and camelCase keys, all pointing to the same values
 */
function camelify(res: Record<string, unknown>): Record<string, unknown> {
  return Object.keys(res).reduce((acc, key) => {
    const camelKey = camelcase(key);
    acc[camelKey] = res[key];
    acc[key] = res[key];
    return acc;
  }, {} as Record<string, unknown>);
}

function expandValue(
  obj: Record<string, string | string[]>,
  value: string,
): string | string[] {
  let poolFound: string | undefined = undefined;
  let keyWithPool: string | undefined = undefined;
  const variableRegex = /(\\?\$.+?\b)/g;
  const variableMatcher = value.match(variableRegex);

  if (variableMatcher) {
    for (const key of variableMatcher) {
      if (key[0] === '$' && obj[key.slice(1) + '_POOL']) {
        keyWithPool = key.slice(1);
        poolFound = key.slice(1) + '_POOL';
        break;
      }
    }
  }

  if (poolFound) {
    const values: string[] = [];
    let pool: string[];

    if (Array.isArray(obj[poolFound])) {
      pool = obj[poolFound] as string[];
    } else {
      pool = (obj[poolFound] as string).split(',').map((s) => s.trim());
      obj[poolFound] = pool;
    }

    for (const o of pool) {
      values.push(
        value.replace(variableRegex, (all, key) => {
          if (key[0] === '$') {
            const keyToReplace = key.slice(1);
            return keyToReplace === keyWithPool ? o : obj[keyToReplace] || key;
          }
          return key;
        }),
      );
    }
    return values;
  } else {
    return value.replace(variableRegex, (all, key) => {
      if (key[0] === '$') {
        const keyToReplace = key.slice(1);
        return obj[keyToReplace] || key;
      }
      return key;
    });
  }
}

/**
 * Expands variable references in an object.
 *
 * Processes all variables in the object to replace references like `$VARIABLE_NAME`
 * with their actual values. Also handles special "pool" expansion where variables
 * can be expanded into arrays of values.
 *
 * @param obj - The object to expand
 * @returns A new object with expanded values
 *
 * @example
 * // Basic variable expansion
 * // Input: { BASE_URL: 'https://api.com', API_URL: '$BASE_URL/v1' }
 * // Output: { BASE_URL: 'https://api.com', API_URL: 'https://api.com/v1' }
 *
 * @example
 * // Pool expansion - creates array when referencing a _POOL variable
 * // Input: {
 * //   SERVER_POOL: 'server1.com,server2.com',
 * //   API_URL: '$SERVER/api'
 * // }
 * // Output: {
 * //   SERVER_POOL: ['server1.com', 'server2.com'],
 * //   API_URL_POOL: ['server1.com/api', 'server2.com/api']
 * // }
 *
 * @remarks
 * - Variables are processed in the order returned by Object.keys()
 * - Variables that reference other variables should be defined before they are used
 * - If a variable references another that hasn't been expanded yet, it will contain
 *   the unexpanded reference (e.g., '$VAR_NAME' as a literal string)
 * - Pool expansion occurs when a variable references another variable that has a
 *   corresponding _POOL version (e.g., $SERVER when SERVER_POOL exists)
 */
export function expand(
  obj: Record<string, string>,
): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = { ...obj };

  for (const [key, value] of Object.entries(obj)) {
    const expandedValue = expandValue(result, value);

    if (expandedValue && Array.isArray(expandedValue)) {
      result[key + '_POOL'] = expandedValue;
    } else if (expandedValue !== result[key]) {
      result[key] = expandedValue;
    }
  }

  return result;
}

/**
 * Expands placeholder variables in a flat object's string values.
 *
 * Processes all string values in the object to replace placeholder references
 * like `$VARIABLE_NAME` with their corresponding values from the reference config.
 * Only processes values that are strings and contain at least one '$' character.
 *
 * @param objectToExpand - The object whose string values should be expanded.
 * @param referenceConfig - The configuration object used to resolve placeholder values.
 *
 * @returns A new object with expanded values.
 *
 * @example
 * const config = { host: 'api', domain: 'example.com' };
 * const obj = { url: '$host.$domain/path' };
 * expandPlaceholderValuesInFlatList(obj, config);
 * // Result: { url: 'api.example.com/path' }
 */
export const expandPlaceholderValuesInFlatList = (
  objectToExpand: Record<string, unknown>,
  referenceConfig: Record<string, string>,
) => {
  const result = { ...objectToExpand };

  for (const [key, value] of Object.entries(result)) {
    if (typeof value == 'string' && value.indexOf('$') > -1) {
      const regex = /\$([a-zA-Z0-9_]+)/g;

      for (const match of value.matchAll(regex)) {
        result[key] = value.replace(`$${match[1]}`, referenceConfig[match[1]]);
      }
    }
  }
  return result;
};

/**
 * Expands placeholder variables in a nested object's string values recursively.
 *
 * Processes all string values throughout the object hierarchy to replace placeholder
 * references like `$VARIABLE_NAME` with their corresponding values from the reference config.
 * Unlike expandPlaceholderValuesInFlatList, this function handles nested objects
 * by recursively traversing the entire object structure.
 *
 * Also supports pool expansion: when a placeholder references a variable that has
 * a corresponding `_POOL` version, the value is expanded into an array of values.
 *
 * @param objToExpand - The object whose string values should be expanded recursively.
 * @param referenceConfig - The configuration object used to resolve placeholder values.
 *
 * @returns A new object with expanded values.
 *
 * @example
 * // Basic recursive expansion
 * const config = { host: 'api', domain: 'example.com' };
 * const obj = {
 *   url: '$host.$domain/path',
 *   nested: { endpoint: '$host/api' }
 * };
 * expandConfigObjectRecursively(obj, config);
 * // Result: { url: 'api.example.com/path', nested: { endpoint: 'api/api' } }
 *
 * @example
 * // Pool expansion (creates arrays)
 * const config = {
 *   SERVER_POOL: 's1.com,s2.com',
 *   PORT: '8080'
 * };
 * const obj = { url: '$SERVER:$PORT' };
 * expandConfigObjectRecursively(obj, config);
 * // Result: { url_POOL: ['s1.com:8080', 's2.com:8080'] }
 */
export const expandConfigObjectRecursively = <
  T extends Array<unknown> | Object,
>(
  objToExpand: T,
  referenceConfig: Record<string, string | string[]>,
) => {
  const result = Array.isArray(objToExpand)
    ? [...objToExpand]
    : { ...objToExpand };
  for (const key of Object.keys(result)) {
    switch (typeof result[key]) {
      case 'string':
        result[key] = expandValue(referenceConfig, result[key]);
        break;
      case 'object':
        result[key] = expandConfigObjectRecursively(
          result[key],
          referenceConfig,
        );
        break;
      default:
        continue;
    }
  }
  return result;
};
