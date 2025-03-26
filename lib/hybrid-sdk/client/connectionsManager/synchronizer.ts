import { retrieveAndLoadRemoteConfigSync } from './remoteConnectionSync';
import { log as logger } from '../../../logs/logger';
import { createWebSocketConnectionPairs } from '../socket';
import { runStartupPlugins } from '../brokerClientPlugins/pluginManager';
import { shutDownConnectionPair } from './connectionHelpers';
import { IdentifyingMetadata, WebSocketConnection } from '../types/client';
import { addTimerToTerminalHandlers } from '../../common/utils/signals';
import { isWebsocketConnOpen } from '../utils/socketHelpers';

export const syncClientConfig = async (
  clientOpts,
  websocketConnections: WebSocketConnection[],
  globalIdentifyingMetadata: IdentifyingMetadata,
) => {
  if (
    !process.env.SKIP_REMOTE_CONFIG &&
    !process.env.REMOTE_CONFIG_POLLING_MODE
  ) {
    // Done at startup only. RPC calls trigger this instead of polling
    await retrieveAndLoadRemoteConfigSync(clientOpts);
  }

  const integrationsKeys = clientOpts.config.connections
    ? Object.keys(clientOpts.config.connections)
    : [];

  if (
    clientOpts.config.UNIVERSAL_BROKER_GA != 'true' ||
    integrationsKeys.length < 1 ||
    websocketConnections.length === 0
  ) {
    logger.info({}, `Waiting for connections (polling).`);
    if (process.env.NODE_ENV != 'test') {
      setTimeout(
        () =>
          syncClientConfig(
            clientOpts,
            websocketConnections,
            globalIdentifyingMetadata,
          ),
        clientOpts.config.connectionsManager.watcher.interval,
      );
    }
  } else {
    logger.debug({}, 'Disabling polling in favor of server notification.');
  }

  for (let i = 0; i < integrationsKeys.length; i++) {
    const currentWebsocketConnectionIndex = websocketConnections.findIndex(
      (websocketConnection) =>
        websocketConnection.friendlyName == integrationsKeys[i],
    );
    if (clientOpts.config.connections[`${integrationsKeys[i]}`].isDisabled) {
      logger.error(
        {
          id: clientOpts.config.connections[`${integrationsKeys[i]}`].id,
          name: clientOpts.config.connections[`${integrationsKeys[i]}`]
            .friendlyName,
        },
        `Connection is disabled due to (a) missing environment variable(s). Please provide the value and restart the broker client.`,
      );
    } else if (
      !clientOpts.config.connections[`${integrationsKeys[i]}`].identifier
    ) {
      if (currentWebsocketConnectionIndex > -1) {
        logger.info(
          {
            id: clientOpts.config.connections[`${integrationsKeys[i]}`].id,
            name: clientOpts.config.connections[`${integrationsKeys[i]}`]
              .friendlyName,
          },
          `Shutting down unused connection.`,
        );
        shutDownConnectionPair(websocketConnections, i);
      } else {
        logger.info(
          {
            id: clientOpts.config.connections[`${integrationsKeys[i]}`].id,
            name: clientOpts.config.connections[`${integrationsKeys[i]}`]
              .friendlyName,
          },
          `Connection (${
            clientOpts.config.connections[`${integrationsKeys[i]}`].friendlyName
          }) not in use by any orgs. Will check periodically and create connection when in use.`,
        );
      }
    } else {
      if (currentWebsocketConnectionIndex < 0) {
        logger.info(
          { connectionName: integrationsKeys[i] },
          'Creating configured connection.',
        );
        await runStartupPlugins(clientOpts, integrationsKeys[i]);

        await createWebSocketConnectionPairs(
          websocketConnections,
          clientOpts,
          globalIdentifyingMetadata,
          integrationsKeys[i],
        );
      } else if (
        // Token rotation for the connection at hand
        clientOpts.config.connections[`${integrationsKeys[i]}`].identifier !=
        websocketConnections[currentWebsocketConnectionIndex].identifier
      ) {
        logger.info(
          { connectionName: integrationsKeys[i] },
          'Updating configured connection for new identifier.',
        );
        // shut down previous tunnels
        shutDownConnectionPair(websocketConnections, i);

        // setup new tunnels

        await runStartupPlugins(clientOpts, integrationsKeys[i]);

        await createWebSocketConnectionPairs(
          websocketConnections,
          clientOpts,
          globalIdentifyingMetadata,
          integrationsKeys[i],
        );
      } else {
        logger.debug(
          { connectionName: integrationsKeys[i] },
          'Connection already configured.',
        );
      }
    }
  }
  if (integrationsKeys.length != websocketConnections.length) {
    const alreadyShutDownConnectionNames: string[] = [];
    for (let i = 0; i < websocketConnections.length; i++) {
      const friendlyName = websocketConnections[i].friendlyName;
      if (
        friendlyName &&
        !integrationsKeys.includes(friendlyName) &&
        !alreadyShutDownConnectionNames.includes(friendlyName)
      ) {
        logger.debug({ friendlyName }, 'Shutting down connection');
        try {
          alreadyShutDownConnectionNames.push(friendlyName);
          shutDownConnectionPair(websocketConnections, i);
        } catch (err) {
          logger.error(
            { err },
            `Error shutting down connection ${friendlyName}`,
          );
        }
      }
    }
  }
};

export const setBackupWatcher = async (
  clientOpts,
  websocketConnections: WebSocketConnection[],
  globalIdentifyingMetadata: IdentifyingMetadata,
) => {
  if (process.env.NODE_ENV != 'test') {
    addTimerToTerminalHandlers(
      setInterval(async () => {
        for (let i = 0; i < websocketConnections.length; i++) {
          if (isWebsocketConnOpen(websocketConnections[i])) {
            return;
          }
        }
        logger.debug(
          {},
          'No configured websocket connection opened. Adding backup polling syncing.',
        );
        await syncClientConfig(
          clientOpts,
          websocketConnections,
          globalIdentifyingMetadata,
        );
      }, clientOpts.config.connectionsManager.watcher.interval),
    );
  } else {
    logger.debug({}, 'Disabling main watcher interval for testing.');
  }
};
