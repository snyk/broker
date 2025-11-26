export interface PluginConnectionConfig {
  contexts?: Record<string, Record<string, unknown>>;

  [key: string]: string | Record<string, Record<string, unknown>> | undefined; // Allows any key with any value type
}

export interface PluginsConfig {
  [key: string]: Record<string, PluginConnectionConfig | string>;
}

const pluginsConfig: PluginsConfig = {};

export const getPluginsConfig = () => {
  return pluginsConfig;
};

export const getPluginConfigByConnectionKey = (connectionKey: string) => {
  return getPluginConfig(connectionKey);
};

export const getPluginConfigParamByConnectionKey = (
  connectionKey: string,
  paramName: string,
) => {
  return getPluginConfigSubKey(connectionKey, paramName);
};

export const getPluginConfigParamByConnectionKeyAndContextId = (
  connectionKey: string,
  contextId: string,
  paramName: string,
) => {
  const pluginConfigForConnection =
    getPluginConfigByConnectionKey(connectionKey);
  return pluginConfigForConnection?.contexts?.[contextId]?.[paramName];
};

export const setPluginConfigParamByConnectionKey = (
  connectionKey: string,
  paramName: string,
  value: PluginConnectionConfig | string,
) => {
  if (!pluginsConfig[connectionKey]) {
    pluginsConfig[connectionKey] = { contexts: {} };
  }

  pluginsConfig[connectionKey][paramName] = value;
};
export const setPluginConfigParamByConnectionKeyAndContextId = (
  connectionKey: string,
  contextId: string,
  paramName: string,
  value: unknown,
) => {
  if (!pluginsConfig[connectionKey]) {
    pluginsConfig[connectionKey] = { contexts: {} };
  }

  if (!pluginsConfig[connectionKey].contexts) {
    pluginsConfig[connectionKey]['contexts'] = {};
  }

  if (!pluginsConfig[connectionKey].contexts[contextId]) {
    pluginsConfig[connectionKey].contexts[contextId] = {};
  }

  // As per above, it will exist no matter what, TS is confused
  pluginsConfig[connectionKey].contexts[contextId]![paramName] = value;
};

export const getPluginConfig = (key: string) => {
  return pluginsConfig[key];
};

export const setPluginConfigKey = (
  key: string,
  value: Record<string, PluginConnectionConfig>,
): void => {
  pluginsConfig[key] = value;
};

export function getPluginConfigSubKey(
  key: string,
  subKey: 'contexts',
): Record<string, Record<string, string>> | undefined;

export function getPluginConfigSubKey(
  key: string,
  subKey: string,
): string | undefined;

// Implementation
export function getPluginConfigSubKey(key: string, subKey: string): any {
  return pluginsConfig[key]?.[subKey];
}

export const setPluginConfigSubKey = (
  key: string,
  subKey: string,
  value: PluginConnectionConfig,
): void => {
  if (!pluginsConfig[key]) {
    pluginsConfig[key] = {};
  }
  pluginsConfig[key][subKey] = value;
};

export const getPluginsContextConfig = (
  connectionName: string,
  contextId: string,
) => {
  return pluginsConfig[connectionName]?.contexts
    ? (pluginsConfig[connectionName]?.contexts[
        contextId
      ] as unknown as PluginConnectionConfig)
    : ({} as PluginConnectionConfig);
};
