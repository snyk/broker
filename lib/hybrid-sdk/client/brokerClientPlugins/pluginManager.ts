import { readdir } from 'fs/promises';
import { log as logger } from '../../../logs/logger';
import BrokerPlugin from './abstractBrokerPlugin';
import { existsSync } from 'fs';
import {
  getPluginsConfig,
  PluginConnectionConfig,
} from '../../common/config/pluginsConfig';
import { PostFilterPreparedRequest } from '../../../broker-workload/prepareRequest';
import { getConfigForIdentifier } from '../../common/config/universal';

/**
 * Loads broker plugins from the given folder into clientOpts.config.plugins.
 *
 * On failure, throws — either the original Error (with its message prefixed
 * by "Error loading plugins from {path}: ") or, if the underlying throwable
 * was not an Error, a fresh Error with the original preserved via
 * `Error.cause`. The local catch deliberately does NOT log — callers must
 * structurally log the thrown err so its stack, code, and cause survive
 * (e.g. `logger.warn({ err }, '...')`, not `logger.warn('...: ' + err)`).
 * The only caller today (lib/hybrid-sdk/client/index.ts main()) does this
 * correctly; any new caller must follow the same shape.
 */
export const loadPlugins = async (pluginsFolderPath: string, clientOpts) => {
  clientOpts.config['plugins'] = new Map<string, unknown>();
  clientOpts.config.supportedBrokerTypes.forEach((type) => {
    clientOpts.config.plugins.set(type, []);
  });
  try {
    logger.debug({}, `Loading plugins from ${pluginsFolderPath}`);
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
            logger.info({}, `Loading plugin ${pluginInstance.pluginName}`);
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
    if (err instanceof Error) {
      err.message = `Error loading plugins from ${pluginsFolderPath}: ${err.message}`;
      throw err;
    }
    throw new Error(
      `Error loading plugins from ${pluginsFolderPath}: ${String(err)}`,
      { cause: err },
    );
  }
};

export const runStartupPlugins = async (clientOpts, connectionKey) => {
  const loadedPlugins = clientOpts.config.plugins as Map<
    string,
    BrokerPlugin[]
  >;
  const pluginsConfig = getPluginsConfig();
  if (
    loadedPlugins.has(`${clientOpts.config.connections[connectionKey].type}`)
  ) {
    const pluginInstances =
      loadedPlugins.get(
        `${clientOpts.config.connections[connectionKey].type}`,
      ) ?? [];
    for (let i = 0; i < pluginInstances.length; i++) {
      await pluginInstances[i].startUp(
        connectionKey,
        clientOpts.config.connections[connectionKey],
        pluginsConfig[connectionKey] as unknown as PluginConnectionConfig,
      );
      const contextIds = clientOpts.config.connections[connectionKey].contexts
        ? Object.keys(clientOpts.config.connections[connectionKey].contexts)
        : [];
      for (const contextId of contextIds) {
        await pluginInstances[i].startUpContext(
          connectionKey,
          contextId,
          clientOpts.config.connections[connectionKey],
          pluginsConfig[connectionKey] as unknown as PluginConnectionConfig,
        );
      }
    }
  }
};

export const runPreRequestPlugins = async (
  clientOpts,
  connectionIdentifier,
  pristinePreRequest: PostFilterPreparedRequest,
  contextId: string | null,
) => {
  let preRequest = pristinePreRequest;
  const loadedPlugins = clientOpts.config.plugins as Map<
    string,
    BrokerPlugin[]
  >;
  const pluginsConfig = getPluginsConfig();
  const connectionsKeys = clientOpts.config.connections
    ? Object.keys(clientOpts.config.connections)
    : [];
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
        getConfigForIdentifier(
          connectionIdentifier,
          clientOpts.config,
          contextId,
        ),
        preRequest,
        pluginsConfig[connectionKey] as unknown as PluginConnectionConfig,
      );
    }
  }

  return preRequest;
};
