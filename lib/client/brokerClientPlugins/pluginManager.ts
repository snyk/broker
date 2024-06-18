import { readdir } from 'fs/promises';
import { log as logger } from '../../logs/logger';
import BrokerPlugin from './abstractBrokerPlugin';
import { existsSync } from 'fs';
import { PostFilterPreparedRequest } from '../../common/relay/prepareRequest';

export const loadPlugins = async (pluginsFolderPath: string, clientOpts) => {
  clientOpts.config['plugins'] = new Map<string, unknown>();
  clientOpts.config.supportedBrokerTypes.forEach((type) => {
    clientOpts.config.plugins.set(type, []);
  });
  try {
    if (existsSync(pluginsFolderPath)) {
      const pluginsFiles = await readdir(pluginsFolderPath);
      for (const pluginFile of pluginsFiles.filter((filename) =>
        filename.endsWith('.js'),
      )) {
        const plugin = await import(`${pluginsFolderPath}/${pluginFile}`);
        // Passing the config object so we can mutate things like filters instead of READONLY
        const pluginInstance = new plugin.Plugin(clientOpts.config);
        const applicableBrokerTypes = pluginInstance.getApplicableTypes();
        applicableBrokerTypes.forEach((applicableBrokerType) => {
          if (
            !pluginInstance.isDisabled(clientOpts.config) &&
            pluginInstance.isPluginActive()
          ) {
            logger.debug({}, `Loading plugin ${pluginInstance.pluginName}`);
            const configPluginForCurrentType =
              clientOpts.config.plugins.get(applicableBrokerType);
            if (
              configPluginForCurrentType.some(
                (x) =>
                  x.pluginCode === pluginInstance.pluginCode ||
                  x.pluginName === pluginInstance.pluginName,
              )
            ) {
              const errMsg = `Some Plugins have identical name or code.`;
              logger.error({}, errMsg);
              throw new Error(errMsg);
            }
            configPluginForCurrentType.push(pluginInstance);
          } else {
            logger.debug(
              {},
              `Skipping plugin ${pluginInstance.pluginName}, not active.`,
            );
          }
        });
      }
    }
    return clientOpts.config['plugins'];
  } catch (err) {
    const errMsg = `Error loading plugins from ${pluginsFolderPath}`;
    logger.error({ err }, `Error loading plugins from ${pluginsFolderPath}`);
    throw new Error(errMsg);
  }
};

export const runStartupPlugins = async (clientOpts, connectionKey) => {
  const loadedPlugins = clientOpts.config.plugins as Map<
    string,
    BrokerPlugin[]
  >;

  // const connectionsKeys = clientOpts.config.connections
  //   ? Object.keys(clientOpts.config.connections)
  //   : [];

  // for (const connectionKey of connectionsKeys) {
  if (
    loadedPlugins.has(`${clientOpts.config.connections[connectionKey].type}`)
  ) {
    const pluginInstances =
      loadedPlugins.get(
        `${clientOpts.config.connections[connectionKey].type}`,
      ) ?? [];
    for (let i = 0; i < pluginInstances.length; i++) {
      await pluginInstances[i].startUp(
        clientOpts.config.connections[connectionKey],
      );
    }
  }
  // }
};

export const runPreRequestPlugins = async (
  clientOpts,
  connectionIdentifier,
  pristinePreRequest: PostFilterPreparedRequest,
) => {
  let preRequest = pristinePreRequest;
  const loadedPlugins = clientOpts.config.plugins as Map<
    string,
    BrokerPlugin[]
  >;
  const connectionsKeys = Object.keys(clientOpts.config.connections);
  let connectionKey;
  for (let i = 0; i < connectionsKeys.length; i++) {
    if (
      clientOpts.config.connections[connectionsKeys[i]].identifier ==
      connectionIdentifier
    ) {
      connectionKey = connectionsKeys[i];
      break;
    }
  }
  if (!connectionsKeys.includes(connectionKey)) {
    const errMsg = `Plugin preRequest: connection ${connectionKey} not found`;
    logger.error({ connectionKey }, errMsg);
    throw new Error(errMsg);
  }

  if (
    loadedPlugins.has(`${clientOpts.config.connections[connectionKey].type}`)
  ) {
    const pluginInstances =
      loadedPlugins.get(
        `${clientOpts.config.connections[connectionKey].type}`,
      ) ?? [];
    for (let i = 0; i < pluginInstances.length; i++) {
      preRequest = await pluginInstances[i].preRequest(
        clientOpts.config.connections[connectionKey],
        preRequest,
      );
    }
  }

  return preRequest;
};
