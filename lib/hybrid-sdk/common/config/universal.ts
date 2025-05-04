import { log as logger } from '../../../logs/logger';
import { Config, ConnectionConfig } from '../../client/types/config';
import { expandPlaceholderValuesInFlatList, getConfig } from './config';
import { getPluginsConfig, getPluginsContextConfig } from './pluginsConfig';
import { determineFilterType } from '../../client/utils/filterSelection';

export const getConfigForType = (type: string) => {
  const config = getConfig();
  return {
    ...config.brokerClientConfiguration.common.default,
    ...config.brokerClientConfiguration.common.required,
    ...config.brokerClientConfiguration[`${type}`]?.default,
    // ...config.brokerClientConfiguration[`${type}`].required,
  };
};

export const getAllowedKeysForType = (type: string) => {
  const config = getConfig();
  return Object.keys({
    ...config.brokerClientConfiguration.common.default,
    ...config.brokerClientConfiguration.common.required,
    ...config.brokerClientConfiguration[`${type}`]?.default,
    ...config.brokerClientConfiguration[`${type}`].required,
  });
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
    ...getValidationConfigForType(
      determineFilterType(config.connections[key].type, config),
    ),
  };
};
export const getValidationConfigForType = (type) => {
  const config = getConfig();
  return {
    validations: config.brokerClientConfiguration[`${type}`].validations,
  };
};
export const getConfigForIdentifier = (
  identifier: string,
  config,
  contextId?: string | null,
) => {
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
  if (
    connectionKey &&
    contextId &&
    (!config.connections[connectionKey].contexts ||
      !config.connections[connectionKey].contexts[contextId] ||
      config.connections[connectionKey].contexts[contextId].isDisabled)
  ) {
    logger.error(
      { connectionKey, contextId },
      `Unable to find active context ${contextId} for ${connectionKey}. Please review config.`,
    );
    throw new Error(
      `Interrupting request. Unable to find context ${contextId} for ${connectionKey}. Please review config.`,
    );
  }

  const contextToInject = {};
  if (connectionKey && contextId) {
    const context = config.connections[connectionKey].contexts[contextId];
    const allowedContextKeys = getAllowedKeysForType(connectionType);
    for (const key in context) {
      if (allowedContextKeys.includes(key)) {
        contextToInject[key] = context[key];
      } else {
        logger.debug(
          { key, connectionKey },
          'Env var in context not allowed for injection in request.',
        );
      }
    }
  }
  const pluginContextToInject = {};
  if (connectionKey && contextId) {
    const pluginContext = getPluginsContextConfig(connectionKey, contextId);
    const allowedContextKeys = getAllowedKeysForType(connectionType);
    for (const key in pluginContext) {
      if (allowedContextKeys.includes(key)) {
        pluginContextToInject[key] = pluginContext[key];
      } else {
        logger.debug(
          { key, connectionKey },
          'Env var in context not allowed for injection in request.',
        );
      }
    }
  }

  const configToOverload = {
    ...(connectionType ? getConfigForType(connectionType) : {}),
    ...(connectionKey ? config.connections[connectionKey] : {}),
    ...contextToInject,
    ...(getPluginsConfig() && getPluginsConfig()[connectionKey!]
      ? getPluginsConfig()[connectionKey!]
      : {}),
    ...pluginContextToInject,
  };
  if (connectionKey && config.connections[connectionKey].contexts) {
    delete configToOverload.contexts;
  }

  const configOverloaded = expandPlaceholderValuesInFlatList(
    configToOverload,
    configToOverload,
  );
  return configOverloaded as Config;
};

export const overloadConfigWithConnectionSpecificConfig = (
  connectionIdentifier,
  localConfig,
  contextId?: string | null,
) => {
  const config = { ...localConfig, ...getConfig() };
  let overloadedConfig = Object.assign(
    {},
    {
      ...localConfig,
      ...getConfigForIdentifier(connectionIdentifier, config, contextId),
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
