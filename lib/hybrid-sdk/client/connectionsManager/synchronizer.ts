import { retrieveAndLoadRemoteConfigSync } from './remoteConnectionSync';
import { log as logger } from '../../../logs/logger';
import { createWebSocketConnectionPairs } from '../socket';
import { runStartupPlugins } from '../brokerClientPlugins/pluginManager';
import { shutDownConnectionPair } from './connectionHelpers';
import {
  ConnectionContext,
  IdentifyingMetadata,
  WebSocketConnection,
} from '../types/client';
import { addTimerToTerminalHandlers } from '../../common/utils/signals';
import { isWebsocketConnOpen } from '../utils/socketHelpers';

/** Internal bookkeeping written by the synchronizer to detect config changes
 *  between sync cycles. Not part of the websocket protocol or identity. */
interface SyncState {
  contexts?: Record<string, ConnectionContext>;
}

/** Synchronizer bookkeeping — tracks the last-seen config per connection
 *  so we can detect changes (e.g. context updates) between sync cycles. */
export const syncStateByConnection = new Map<string, SyncState>();

/**
 * Keeps WebSocket connections and plugins in sync with configured integrations. For each
 * connection, detects whether it is new, removed, disabled, or changed (identifier rotation,
 * context updates) and reacts accordingly: initializing plugins, creating or tearing down
 * websocket pairs, and re-running plugin startup when contexts change. Optionally loads remote
 * config once at startup and schedules itself to poll when server notifications are unavailable.
 * Mutates websocketConnections in place.
 */
export const syncClientConfig = async (
  clientOpts,
  websocketConnections: WebSocketConnection[],
  globalIdentifyingMetadata: IdentifyingMetadata,
): Promise<void> => {
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

  const isPollingRequired =
    clientOpts.config.UNIVERSAL_BROKER_GA !== 'true' ||
    integrationsKeys.length < 1 ||
    websocketConnections.length === 0;

  if (isPollingRequired) {
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

  for (const key of integrationsKeys) {
    const connectionConfig = clientOpts.config.connections[key];

    const currentWebsocketConnectionIndex = websocketConnections.findIndex(
      (conn) => conn.friendlyName === key,
    );
    if (connectionConfig.isDisabled) {
      logger.error(
        {
          id: connectionConfig.id,
          name: connectionConfig.friendlyName,
        },
        `Connection is disabled due to (a) missing environment variable(s). Please provide the value and restart the broker client.`,
      );
      continue;
    }
    if (!connectionConfig.identifier) {
      if (currentWebsocketConnectionIndex > -1) {
        logger.info(
          {
            id: connectionConfig.id,
            name: connectionConfig.friendlyName,
          },
          `Shutting down unused connection.`,
        );
        shutDownConnectionPair(
          websocketConnections,
          integrationsKeys.indexOf(key),
        );
      } else {
        logger.info(
          {
            id: connectionConfig.id,
            name: connectionConfig.friendlyName,
          },
          `Connection (${connectionConfig.friendlyName}) not in use by any orgs. Will check periodically and create connection when in use.`,
        );
      }
      continue;
    }

    // If connection doesn't exist, create it
    if (currentWebsocketConnectionIndex < 0) {
      logger.info({ connectionName: key }, 'Creating configured connection.');
      await runStartupPlugins(clientOpts, key);

      const [primary, secondary] = await createWebSocketConnectionPairs(
        clientOpts,
        globalIdentifyingMetadata,
        key,
      );
      websocketConnections.push(primary, secondary);
    } else if (
      // Token rotation for the connection at hand
      connectionConfig.identifier !=
      websocketConnections[currentWebsocketConnectionIndex].identifier
    ) {
      logger.info(
        { connectionName: key },
        'Updating configured connection for new identifier.',
      );
      // shut down previous tunnels
      shutDownConnectionPair(
        websocketConnections,
        integrationsKeys.indexOf(key),
      );

      // setup new tunnels
      await runStartupPlugins(clientOpts, key);

      const [primary, secondary] = await createWebSocketConnectionPairs(
        clientOpts,
        globalIdentifyingMetadata,
        key,
      );
      websocketConnections.push(primary, secondary);
    } else {
      // If contexts have changed, re-run plugins for the connection
      const contextsChanged =
        JSON.stringify(connectionConfig.contexts ?? {}) !==
        JSON.stringify(syncStateByConnection.get(key)?.contexts ?? {});
      if (contextsChanged) {
        logger.info(
          { connectionName: key },
          'Contexts changed, re-running plugins.',
        );
        await runStartupPlugins(clientOpts, key);
      } else {
        logger.debug({ connectionName: key }, 'Connection already configured.');
      }
    }

    syncStateByConnection.set(key, { contexts: connectionConfig.contexts });
  }

  // Shut down connections that are no longer configured
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
          syncStateByConnection.delete(friendlyName);
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
