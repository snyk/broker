const pluginsConfig: Record<string, any> = {};

export const getPluginsConfig = () => {
  return pluginsConfig;
};

export const getPluginsConfigByConnectionKey = (connectionKey: string) => {
  return getPluginConfig(connectionKey) ?? {};
};

export const getPluginConfig = (
  key: string,
): Record<string, Record<string, string>> => {
  return pluginsConfig[key];
};

export const setPluginConfig = (key: string, value: any): void => {
  pluginsConfig[key] = value;
};

export const getPluginConfigSubKey = (key: string, subKey: string): string => {
  return pluginsConfig[key][subKey];
};

export const setPluginConfigSubKey = (
  key: string,
  subKey: string,
  value: any,
): void => {
  if (!pluginsConfig[key]) {
    pluginsConfig[key] = {};
  }
  pluginsConfig[key][subKey] = value;
};
