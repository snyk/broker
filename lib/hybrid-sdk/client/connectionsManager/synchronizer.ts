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
import {
  addIntervalToTerminalHandlers,
  clearAndRemoveInterval,
  isShuttingDown,
} from '../../common/utils/signals';
import { isWebsocketConnOpen } from '../utils/socketHelpers';

/** Internal bookkeeping written by the synchronizer to detect config changes
 *  between sync cycles. Not part of the websocket protocol or identity. */
interface SyncState {
  contexts?: Record<string, ConnectionContext>;
  /** True if the connection was observed in `isDisabled` state on the
   *  previous cycle. Used to log the disabled ERROR (and the recovery INFO)
   *  on transitions only, not on every polling cycle while the connection
   *  remains disabled. Absent ↔ unknown/never-observed ↔ treated as false. */
  wasDisabled?: boolean;
}

/** Synchronizer bookkeeping — tracks the last-seen config per connection
 *  so we can detect changes (e.g. context updates) between sync cycles. */
export const syncStateByConnection = new Map<string, SyncState>();

/** Handle of the active polling interval, or null when polling is not running.
 *  At most one interval exists at a time: registering only when null avoids
 *  unbounded growth of the signals timer registry, and clearing it when
 *  polling is no longer required stops the recurring sync cycles. */
let pollingIntervalId: NodeJS.Timeout | null = null;

/** Re-entrancy guard. Polling, backup-watcher, and RPC-triggered calls can
 *  race. We coalesce instead of drop: at most one extra cycle is queued, so
 *  an RPC reload arriving mid-sync still triggers a follow-up pass to pick
 *  up the latest state. */
let isSyncing = false;
let resyncPending = false;

/** Test-only reset. The registration flag is module-level state; tests that
 *  trigger the polling branch need to clear it between cases. */
export const __resetSynchronizerStateForTests = () => {
  if (pollingIntervalId) {
    clearAndRemoveInterval(pollingIntervalId);
  }
  pollingIntervalId = null;
  isSyncing = false;
  resyncPending = false;
};

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
  if (isShuttingDown()) {
    return;
  }
  if (isSyncing) {
    // Coalesce: queue exactly one follow-up cycle so the latest state is
    // observed without stacking concurrent syncs.
    resyncPending = true;
    logger.debug(
      {},
      'syncClientConfig already in progress, queuing follow-up cycle.',
    );
    return;
  }
  isSyncing = true;
  try {
    do {
      resyncPending = false;
      await runSyncCycle(
        clientOpts,
        websocketConnections,
        globalIdentifyingMetadata,
      );
    } while (resyncPending && !isShuttingDown());
  } finally {
    isSyncing = false;
  }
};

const runSyncCycle = async (
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
    logger.debug({}, `Waiting for connections (polling).`);
    if (process.env.NODE_ENV != 'test' && !pollingIntervalId) {
      pollingIntervalId = setInterval(
        () =>
          syncClientConfig(
            clientOpts,
            websocketConnections,
            globalIdentifyingMetadata,
          ),
        clientOpts.config.connectionsManager.watcher.interval,
      );
      addIntervalToTerminalHandlers(pollingIntervalId);
    }
  } else {
    logger.debug({}, 'Disabling polling in favor of server notification.');
    if (pollingIntervalId) {
      clearAndRemoveInterval(pollingIntervalId);
      pollingIntervalId = null;
    }
  }

  for (const key of integrationsKeys) {
    const connectionConfig = clientOpts.config.connections[key];

    const currentWebsocketConnectionIndex = websocketConnections.findIndex(
      (conn) => conn.friendlyName === key,
    );

    // Log the disabled ERROR (and its INFO recovery) on transitions only.
    // Before: every poll cycle while a connection stayed disabled produced
    // a fresh ERROR — unbounded alert noise from a single misconfigured
    // connection. After: one ERROR per enabled→disabled transition,
    // one INFO per disabled→enabled recovery.
    const prevWasDisabled =
      syncStateByConnection.get(key)?.wasDisabled === true;
    const nowIsDisabled = connectionConfig.isDisabled === true;

    if (nowIsDisabled) {
      if (!prevWasDisabled) {
        logger.error(
          {
            id: connectionConfig.id,
            name: connectionConfig.friendlyName,
          },
          `Connection is disabled due to (a) missing environment variable(s). Please provide the value and restart the broker client.`,
        );
      }
      // Mark disabled in state so subsequent cycles dedupe. We deliberately
      // keep this state inside the disabled branch (the existing
      // syncStateByConnection.set below runs only on the fall-through path).
      syncStateByConnection.set(key, {
        ...syncStateByConnection.get(key),
        wasDisabled: true,
      });
      continue;
    }

    if (prevWasDisabled) {
      // Recovery: previous cycle saw isDisabled=true, this cycle does not.
      // INFO so operators see "the disabled state cleared" without alerting.
      logger.info(
        {
          id: connectionConfig.id,
          name: connectionConfig.friendlyName,
        },
        'Connection recovered from disabled state; resuming setup.',
      );
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
        logger.debug(
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
        clientOpts.metricsClient,
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
        clientOpts.metricsClient,
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
        logger.info({ friendlyName }, 'Shutting down connection');
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
    addIntervalToTerminalHandlers(
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
