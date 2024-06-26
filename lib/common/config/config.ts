import fs from 'fs';
import path from 'path';
import camelcase from 'camelcase';
import { loadConfig } from 'snyk-config';
import dotenv from 'dotenv';
import { log as logger } from '../../logs/logger';

let config: Record<string, any> = {};

export interface CONFIG {
  supportedBrokerTypes: string[];
  brokerType: 'client' | 'server';
  filterRulesPath: { [key: string]: string };
}

export const getConfig = () => {
  return config;
};
export type CONFIGURATION = CONFIG & Record<string, any>;

export const findProjectRoot = (startDir: string): string | null => {
  let currentDir = startDir;

  while (currentDir !== '/') {
    const snykConfigPath = path.join(currentDir, 'config.default.json');

    if (fs.existsSync(snykConfigPath)) {
      return currentDir;
    }

    currentDir = path.dirname(currentDir);
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
    expand(process.env);
    config = Object.assign({}, camelify(localConfig), camelify(process.env));
    // for each in config.brokerClientConfiguration.common.default check if process env exist and if it does,
    // override config.brokerClientConfiguration.common.default
    // clientOpts.config.brokerClientConfiguration.common.default.BROKER_SERVER_URL = process.env.BROKER_SERVER_URL
    if (config.universalBrokerEnabled) {
      config = getConsolidatedConfigForUniversalBroker(config);
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
      !Array.isArray(value)
    ) {
      config[key] = value.split(',').map((s) => s.trim());
    }
  }
  return;
};

const getConsolidatedConfigForUniversalBroker = (configToConsolidate) => {
  const commonDefaultConfigKeys = Object.keys(
    configToConsolidate.brokerClientConfiguration.common.default,
  );
  for (let i = 0; i < commonDefaultConfigKeys.length; i++) {
    // override default values with any env var override for the common settings
    configToConsolidate.brokerClientConfiguration.common.default[
      commonDefaultConfigKeys[i]
    ] =
      process.env[commonDefaultConfigKeys[i]] ||
      configToConsolidate.brokerClientConfiguration.common.default[
        commonDefaultConfigKeys[i]
      ];

    // Moving common settings only to config level like classic broker
    configToConsolidate[commonDefaultConfigKeys[i]] =
      configToConsolidate.brokerClientConfiguration.common.default[
        commonDefaultConfigKeys[i]
      ];
  }
  // share the broker client url across the connections requiring it
  if (configToConsolidate.brokerClientUrl) {
    const brokerClientConfigurationKeys = Object.keys(
      configToConsolidate.brokerClientConfiguration,
    );
    for (const key of brokerClientConfigurationKeys) {
      if (
        configToConsolidate.brokerClientConfiguration[key].required
          .BROKER_CLIENT_URL
      ) {
        configToConsolidate.brokerClientConfiguration[
          key
        ].default.BROKER_CLIENT_URL = configToConsolidate.brokerClientUrl;
      }
    }
  }
  return camelify(configToConsolidate);
};

function camelify(res: Record<string, any>): Record<string, any> {
  return Object.keys(res).reduce((acc, key) => {
    const camelKey = camelcase(key);
    acc[camelKey] = res[key];
    acc[key] = res[key];
    return acc;
  }, {} as Record<string, any>);
}

function expandValue(
  obj: Record<string, any>,
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

function expand(obj: Record<string, any>): Record<string, any> {
  const keys = Object.keys(obj);
  for (const key of keys) {
    const value = expandValue(obj, obj[key]);
    if (value && Array.isArray(value)) {
      obj[key + '_POOL'] = value;
    } else if (value !== obj[key]) {
      obj[key] = value;
    }
  }

  return obj;
}

export const expandPlaceholderValuesInFlatList = (
  objectToExpand: Object,
  referenceConfig: Object,
) => {
  for (const key of Object.keys(objectToExpand)) {
    if (
      typeof objectToExpand[key] == 'string' &&
      objectToExpand[key].indexOf('$') > -1
    ) {
      const regex = /\$([a-zA-Z0-9_]+)/g;

      for (const match of objectToExpand[key].matchAll(regex)) {
        objectToExpand[key] = objectToExpand[key].replace(
          `$${match[1]}`,
          referenceConfig[match[1]],
        );
      }
    }
  }
  return objectToExpand;
};

export const expandConfigObjectRecursively = (
  objToExpand: Object,
  referenceConfig: Object,
) => {
  for (const key of Object.keys(objToExpand)) {
    if (typeof objToExpand[key] == 'string') {
      objToExpand[key] = expandValue(referenceConfig, objToExpand[key]);
    } else {
      objToExpand[key] = expandConfigObjectRecursively(
        objToExpand[key],
        referenceConfig,
      );
    }
  }
  return objToExpand as any;
};
