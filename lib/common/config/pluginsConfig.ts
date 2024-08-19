const pluginsConfig: Record<string, any> = {};

export const getPluginsConfig = () => {
  return pluginsConfig;
};

export const getPluginsConfigByConnectionKey = (connectionKey: string) => {
  return pluginsConfig[connectionKey] ?? {};
};
