import { LoadedClientOpts } from '../../common/types/options';
import { IdentifyingMetadata, WebSocketConnection } from '../types/client';
import { retrieveAndLoadRemoteConfigSync } from './remoteConnectionSync';
import { log as logger } from '../../logs/logger';
import { createWebSocketConnectionPairs } from '../socket';
import { runStartupPlugins } from '../brokerClientPlugins/pluginManager';
import { addTimerToTerminalHandlers } from '../../common/utils/signals';
export const setMainWatcher = async (
  clientOpts: LoadedClientOpts,
  websocketConnections: WebSocketConnection[],
  globalIdentifyingMetadata: IdentifyingMetadata,
) => {
  const watcher = async () => {
    if (!process.env.SKIP_REMOTE_CONFIG) {
      await retrieveAndLoadRemoteConfigSync(clientOpts);
    }

    const integrationsKeys = clientOpts.config.connections
      ? Object.keys(clientOpts.config.connections)
      : [];
    if (integrationsKeys.length < 1) {
      logger.info(
        {},
        `Found deployment ${clientOpts.config.deploymentId}. Waiting for connections. (polling)`,
      );
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
            `Shutting down unused connection`,
          );
          websocketConnections[currentWebsocketConnectionIndex].end();
          websocketConnections[currentWebsocketConnectionIndex].destroy();
          websocketConnections.splice(currentWebsocketConnectionIndex, 1);
          const secondTunnelIndex = websocketConnections.findIndex(
            (websocketConnection) =>
              websocketConnection.friendlyName == integrationsKeys[i],
          );
          websocketConnections[secondTunnelIndex].end();
          websocketConnections[secondTunnelIndex].destroy();
          websocketConnections.splice(secondTunnelIndex, 1);
        } else {
          logger.info(
            {
              id: clientOpts.config.connections[`${integrationsKeys[i]}`].id,
              name: clientOpts.config.connections[`${integrationsKeys[i]}`]
                .friendlyName,
            },
            `Connection (${
              clientOpts.config.connections[`${integrationsKeys[i]}`]
                .friendlyName
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
        } else {
          logger.debug(
            { connectionName: integrationsKeys[i] },
            'Connection already configured.',
          );
        }
      }
    }
  };

  if (process.env.NODE_ENV != 'test') {
    addTimerToTerminalHandlers(
      setInterval(
        watcher,
        clientOpts.config.connectionsManager.watcher.interval,
      ),
    );
  } else {
    console.log('Disabling main watcher interval for testing');
  }
  await watcher();
};
