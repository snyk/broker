import { log as logger } from '../../logs/logger';
import { Config, ConnectionConfig } from '../../client/types/config';
import { expandPlaceholderValuesInFlatList, getConfig } from './config';

export const getConfigForType = (type: string) => {
  const config = getConfig();
  return {
    ...config.brokerClientConfiguration.common.default,
    ...config.brokerClientConfiguration.common.required,
    ...config.brokerClientConfiguration[`${type}`]?.default,
    // ...config.brokerClientConfiguration[`${type}`].required,
  };
};

export const getConfigForConnections = () => {
  const config = getConfig();
  return getConfigForConnectionsFromConfig(config);
};

export const getConfigForConnectionsFromConfig = (config) => {
  const connectionsConfig = new Map<string, ConnectionConfig>();
  for (const key in config.connections) {
    connectionsConfig.set(key, getConfigForConnection(key, config));
  }
  return connectionsConfig;
};

export const getConfigForConnection = (key, config) => {
  return {
    ...getConfigForType(config.connections[key].type),
    ...config.connections[key],
    ...getValidationConfigForType(config.connections[key].type),
  };
};
export const getValidationConfigForType = (type) => {
  const config = getConfig();
  return {
    validations: config.brokerClientConfiguration[`${type}`].validations,
  };
};
export const getConfigForIdentifier = (identifier: string, config) => {
  const connection = findConnectionWithIdentifier(
    config.connections,
    identifier,
  );
  const connectionKey = connection?.key || undefined;
  const connectionType = connection?.value.type || undefined;
  if (!connectionType) {
    logger.error(
      { integrations: config.integrations },
      `Unable to find configuration type for ${identifier}. Please review config.`,
    );
    // throw new Error(
    //   `Unable to find configuration type for ${identifier}. Please review config.`,
    // );
  }
  if (!connectionKey) {
    logger.error(
      { integrations: config.integrations },
      `Unable to find configuration type for ${identifier}. Please review config.`,
    );
    // throw new Error(
    //   `Unable to find configuration type for ${identifier}. Please review config.`,
    // );
  }
  const configToOverload = {
    ...(connectionType ? getConfigForType(connectionType) : {}),
    ...(connectionKey ? config.connections[connectionKey] : {}),
  };
  const configOverloaded = expandPlaceholderValuesInFlatList(
    configToOverload,
    configToOverload,
  );
  return configOverloaded as Config;
};

export const overloadConfigWithConnectionSpecificConfig = (
  connectionIdentifier,
  localConfig,
) => {
  const config = getConfig();
  let overloadedConfig = Object.assign(
    {},
    {
      ...localConfig,
      ...getConfigForIdentifier(connectionIdentifier, config),
    },
  );
  overloadedConfig = expandPlaceholderValuesInFlatList(
    overloadedConfig,
    overloadedConfig,
  );
  return overloadedConfig;
};

const findConnectionWithIdentifier = (connections: Object, identifier) => {
  if (!connections) {
    const refError = new ReferenceError(
      'Error Finding connections configuration',
    );
    refError['code'] = 'UNEXPECTED_INVALID_CONNECTIONS_CONFIG';
    throw refError;
  }
  for (const key of Object.keys(connections)) {
    if (connections[key].identifier === identifier) {
      return { key, value: connections[key] };
    }
  }
};
