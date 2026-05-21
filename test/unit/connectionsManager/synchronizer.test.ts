import {
  __resetSynchronizerStateForTests,
  syncClientConfig,
  syncStateByConnection,
} from '../../../lib/hybrid-sdk/client/connectionsManager/synchronizer';
import {
  IdentifyingMetadata,
  Role,
  WebSocketConnection,
} from '../../../lib/hybrid-sdk/client/types/client';

import * as pluginManager from '../../../lib/hybrid-sdk/client/brokerClientPlugins/pluginManager';
import * as socket from '../../../lib/hybrid-sdk/client/socket';
import * as connectionHelpers from '../../../lib/hybrid-sdk/client/connectionsManager/connectionHelpers';
import * as signals from '../../../lib/hybrid-sdk/common/utils/signals';
import * as remoteConnectionSync from '../../../lib/hybrid-sdk/client/connectionsManager/remoteConnectionSync';
import { log as logger } from '../../../lib/logs/logger';

jest.mock(
  '../../../lib/hybrid-sdk/client/connectionsManager/remoteConnectionSync',
);
jest.mock('../../../lib/hybrid-sdk/client/brokerClientPlugins/pluginManager');
jest.mock('../../../lib/hybrid-sdk/client/socket');
jest.mock(
  '../../../lib/hybrid-sdk/client/connectionsManager/connectionHelpers',
);
jest.mock('../../../lib/hybrid-sdk/common/utils/signals', () => ({
  isShuttingDown: jest.fn(() => false),
  addIntervalToTerminalHandlers: jest.fn(),
  addTimeoutToTerminalHandlers: jest.fn(),
}));

const mockedPluginManager = jest.mocked(pluginManager);
const mockedSocket = jest.mocked(socket);
const mockedConnectionHelpers = jest.mocked(connectionHelpers);
const mockedSignals = jest.mocked(signals);
const mockedRemoteConnectionSync = jest.mocked(remoteConnectionSync);

/** Create a minimal mock WebSocketConnection */
function makeWsConn(
  friendlyName: string,
  identifier: string,
): WebSocketConnection {
  return {
    friendlyName,
    identifier,
    end: jest.fn(),
    destroy: jest.fn(),
    emit: jest.fn(),
    on: jest.fn(),
    send: jest.fn(),
    role: Role.primary,
    serverId: 'server-1',
    socketType: 'client',
    supportedIntegrationType: 'github',
    socket: {},
    readyState: 1,
    transport: {},
    url: new URL('http://localhost'),
  } as unknown as WebSocketConnection;
}

function makeClientOpts(
  connections: Record<string, any> | undefined,
): Record<string, any> {
  return {
    config: {
      supportedBrokerTypes: [],
      filterRulesPaths: {},
      brokerType: 'client',
      UNIVERSAL_BROKER_GA: 'true',
      connections,
      connectionsManager: {
        watcher: { interval: 30000 },
      },
    },
  };
}

const IDENTIFYING_METADATA: IdentifyingMetadata = {
  capabilities: [],
  clientId: '',
  filters: new Map(),
  preflightChecks: undefined,
  version: '',
  id: '',
  isDisabled: false,
  clientConfig: {
    brokerClientId: '123',
    haMode: false,
    debugMode: false,
    bodyLogMode: false,
    credPooling: false,
    privateCa: false,
    tlsReject: false,
    proxy: false,
    customAccept: false,
    insecureDownstream: false,
    universalBroker: false,
    version: 'local',
  },
  role: Role.primary,
};

describe('syncClientConfig', () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    // clearAllMocks resets call history but not mockReturnValue overrides.
    mockedSignals.isShuttingDown.mockReturnValue(false);
    syncStateByConnection.clear();
    __resetSynchronizerStateForTests();
    process.env.SKIP_REMOTE_CONFIG = 'true';
    process.env.NODE_ENV = 'test';

    // By default, createWebSocketConnectionPairs returns a pair of mock conns
    mockedSocket.createWebSocketConnectionPairs.mockImplementation(
      async (_clientOpts, _meta, connKey) => {
        return [
          makeWsConn(connKey, 'token-1'),
          makeWsConn(connKey, 'token-1'),
        ] as [WebSocketConnection, WebSocketConnection];
      },
    );

    // shutDownConnectionPair removes the pair from the array
    mockedConnectionHelpers.shutDownConnectionPair.mockImplementation(
      (wsConns, index) => {
        const friendlyName = wsConns[index].friendlyName;
        wsConns.splice(index, 1);
        const secondIndex = wsConns.findIndex(
          (c) => c.friendlyName === friendlyName,
        );
        if (secondIndex > -1) {
          wsConns.splice(secondIndex, 1);
        }
      },
    );
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it('should do nothing when no connections are configured', async () => {
    const clientOpts = makeClientOpts(undefined);
    const wsConns: WebSocketConnection[] = [];
    await syncClientConfig(clientOpts, wsConns, IDENTIFYING_METADATA);

    expect(mockedPluginManager.runStartupPlugins).not.toHaveBeenCalled();
    expect(mockedSocket.createWebSocketConnectionPairs).not.toHaveBeenCalled();
    expect(
      mockedConnectionHelpers.shutDownConnectionPair,
    ).not.toHaveBeenCalled();
  });

  it('should create a new connection when it has an identifier and no existing websocket', async () => {
    const clientOpts = makeClientOpts({
      'my-conn': {
        type: 'github',
        identifier: 'token-1',
        friendlyName: 'my-conn',
      },
    });
    const wsConns: WebSocketConnection[] = [];
    await syncClientConfig(clientOpts, wsConns, IDENTIFYING_METADATA);

    expect(mockedPluginManager.runStartupPlugins).toHaveBeenCalledWith(
      clientOpts,
      'my-conn',
    );
    expect(mockedSocket.createWebSocketConnectionPairs).toHaveBeenCalledWith(
      clientOpts,
      IDENTIFYING_METADATA,
      'my-conn',
      undefined,
    );
    expect(syncStateByConnection.get('my-conn')?.contexts).toBeUndefined();
  });

  it('should store contexts in syncStateByConnection when creating with contexts', async () => {
    const contexts = { 'ctx-1': { PARAM: 'val' } };
    const clientOpts = makeClientOpts({
      'my-conn': {
        type: 'github',
        identifier: 'token-1',
        friendlyName: 'my-conn',
        contexts,
      },
    });
    const wsConns: WebSocketConnection[] = [];
    await syncClientConfig(clientOpts, wsConns, IDENTIFYING_METADATA);

    expect(mockedPluginManager.runStartupPlugins).toHaveBeenCalledWith(
      clientOpts,
      'my-conn',
    );
    expect(syncStateByConnection.get('my-conn')?.contexts).toEqual(contexts);
  });

  it('should skip an existing connection with the same identifier', async () => {
    const clientOpts = makeClientOpts({
      'my-conn': {
        type: 'github',
        identifier: 'token-1',
        friendlyName: 'my-conn',
      },
    });
    const wsConns: WebSocketConnection[] = [
      makeWsConn('my-conn', 'token-1'),
      makeWsConn('my-conn', 'token-1'),
    ];
    await syncClientConfig(clientOpts, wsConns, IDENTIFYING_METADATA);

    expect(mockedPluginManager.runStartupPlugins).not.toHaveBeenCalled();
    expect(mockedSocket.createWebSocketConnectionPairs).not.toHaveBeenCalled();
    expect(
      mockedConnectionHelpers.shutDownConnectionPair,
    ).not.toHaveBeenCalled();
  });

  it('should tear down and recreate a connection when its identifier changes', async () => {
    const clientOpts = makeClientOpts({
      'my-conn': {
        type: 'github',
        identifier: 'token-2',
        friendlyName: 'my-conn',
      },
    });
    const wsConns: WebSocketConnection[] = [
      makeWsConn('my-conn', 'token-1'),
      makeWsConn('my-conn', 'token-1'),
    ];
    await syncClientConfig(clientOpts, wsConns, IDENTIFYING_METADATA);

    expect(mockedConnectionHelpers.shutDownConnectionPair).toHaveBeenCalledWith(
      wsConns,
      0,
    );
    expect(mockedPluginManager.runStartupPlugins).toHaveBeenCalledWith(
      clientOpts,
      'my-conn',
    );
    expect(mockedSocket.createWebSocketConnectionPairs).toHaveBeenCalledWith(
      clientOpts,
      IDENTIFYING_METADATA,
      'my-conn',
      undefined,
    );
    expect(syncStateByConnection.get('my-conn')?.contexts).toBeUndefined();
  });

  it('should skip a disabled connection', async () => {
    const clientOpts = makeClientOpts({
      'my-conn': {
        type: 'github',
        identifier: 'token-1',
        friendlyName: 'my-conn',
        isDisabled: true,
        id: 'conn-id',
      },
    });
    const wsConns: WebSocketConnection[] = [];
    await syncClientConfig(clientOpts, wsConns, IDENTIFYING_METADATA);

    expect(mockedPluginManager.runStartupPlugins).not.toHaveBeenCalled();
    expect(mockedSocket.createWebSocketConnectionPairs).not.toHaveBeenCalled();
    expect(
      mockedConnectionHelpers.shutDownConnectionPair,
    ).not.toHaveBeenCalled();
  });

  it('should do nothing for a connection without an identifier that is not yet active', async () => {
    const clientOpts = makeClientOpts({
      'my-conn': {
        type: 'github',
        identifier: null,
        friendlyName: 'my-conn',
        id: 'conn-id',
      },
    });
    const wsConns: WebSocketConnection[] = [];
    await syncClientConfig(clientOpts, wsConns, IDENTIFYING_METADATA);

    expect(mockedPluginManager.runStartupPlugins).not.toHaveBeenCalled();
    expect(mockedSocket.createWebSocketConnectionPairs).not.toHaveBeenCalled();
    expect(
      mockedConnectionHelpers.shutDownConnectionPair,
    ).not.toHaveBeenCalled();
  });

  it('should shut down a previously active connection that lost its identifier', async () => {
    const clientOpts = makeClientOpts({
      'my-conn': {
        type: 'github',
        identifier: null,
        friendlyName: 'my-conn',
        id: 'conn-id',
      },
    });
    const wsConns: WebSocketConnection[] = [
      makeWsConn('my-conn', 'token-1'),
      makeWsConn('my-conn', 'token-1'),
    ];
    await syncClientConfig(clientOpts, wsConns, IDENTIFYING_METADATA);

    expect(mockedConnectionHelpers.shutDownConnectionPair).toHaveBeenCalled();
    expect(mockedPluginManager.runStartupPlugins).not.toHaveBeenCalled();
    expect(mockedSocket.createWebSocketConnectionPairs).not.toHaveBeenCalled();
  });

  it('should shut down a websocket whose connection was removed from config', async () => {
    const clientOpts = makeClientOpts({});
    const wsConns: WebSocketConnection[] = [
      makeWsConn('removed-conn', 'token-1'),
      makeWsConn('removed-conn', 'token-1'),
    ];
    await syncClientConfig(clientOpts, wsConns, IDENTIFYING_METADATA);

    expect(mockedConnectionHelpers.shutDownConnectionPair).toHaveBeenCalled();
  });

  it('should not re-run plugins when contexts are unchanged on an existing connection', async () => {
    const contexts = { 'ctx-1': { PARAM: 'val' } };
    const clientOpts = makeClientOpts({
      'my-conn': {
        type: 'github',
        identifier: 'token-1',
        friendlyName: 'my-conn',
        contexts,
      },
    });
    syncStateByConnection.set('my-conn', { contexts });
    const wsConns: WebSocketConnection[] = [
      makeWsConn('my-conn', 'token-1'),
      makeWsConn('my-conn', 'token-1'),
    ];
    await syncClientConfig(clientOpts, wsConns, IDENTIFYING_METADATA);

    expect(mockedPluginManager.runStartupPlugins).not.toHaveBeenCalled();
    expect(mockedSocket.createWebSocketConnectionPairs).not.toHaveBeenCalled();
    expect(
      mockedConnectionHelpers.shutDownConnectionPair,
    ).not.toHaveBeenCalled();
  });

  describe('log levels', () => {
    let infoSpy: jest.SpyInstance;
    let debugSpy: jest.SpyInstance;

    beforeEach(() => {
      infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});
      debugSpy = jest.spyOn(logger, 'debug').mockImplementation(() => {});
    });
    afterEach(() => jest.restoreAllMocks());

    it('logs "Waiting for connections (polling)." at DEBUG, not INFO', async () => {
      const clientOpts = makeClientOpts(undefined);
      await syncClientConfig(clientOpts, [], IDENTIFYING_METADATA);

      expect(debugSpy).toHaveBeenCalledWith(
        expect.anything(),
        'Waiting for connections (polling).',
      );
      expect(infoSpy).not.toHaveBeenCalledWith(
        expect.anything(),
        'Waiting for connections (polling).',
      );
    });

    it('logs the "not in use by any orgs" message at DEBUG, not INFO', async () => {
      const clientOpts = makeClientOpts({
        'my-conn': {
          type: 'github',
          identifier: null,
          friendlyName: 'my-conn',
          id: 'conn-id',
        },
      });
      await syncClientConfig(clientOpts, [], IDENTIFYING_METADATA);

      expect(debugSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('not in use by any orgs'),
      );
      expect(infoSpy).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('not in use by any orgs'),
      );
    });

    it('logs "Shutting down connection" at INFO, not DEBUG', async () => {
      const clientOpts = makeClientOpts({});
      const wsConns: WebSocketConnection[] = [
        makeWsConn('removed-conn', 'token-1'),
        makeWsConn('removed-conn', 'token-1'),
      ];
      await syncClientConfig(clientOpts, wsConns, IDENTIFYING_METADATA);

      expect(infoSpy).toHaveBeenCalledWith(
        expect.objectContaining({ friendlyName: 'removed-conn' }),
        'Shutting down connection',
      );
      expect(debugSpy).not.toHaveBeenCalledWith(
        expect.anything(),
        'Shutting down connection',
      );
    });
  });

  describe('shutdown gate', () => {
    afterEach(() => {
      mockedSignals.isShuttingDown.mockReturnValue(false);
    });

    it('returns immediately when isShuttingDown() is true, without calling retrieveAndLoadRemoteConfigSync', async () => {
      mockedSignals.isShuttingDown.mockReturnValue(true);
      delete process.env.SKIP_REMOTE_CONFIG;
      const clientOpts = makeClientOpts({
        'my-conn': {
          type: 'github',
          identifier: 'token-1',
          friendlyName: 'my-conn',
        },
      });
      const wsConns: WebSocketConnection[] = [];

      await syncClientConfig(clientOpts, wsConns, IDENTIFYING_METADATA);

      expect(
        mockedRemoteConnectionSync.retrieveAndLoadRemoteConfigSync,
      ).not.toHaveBeenCalled();
      expect(mockedPluginManager.runStartupPlugins).not.toHaveBeenCalled();
      expect(
        mockedSocket.createWebSocketConnectionPairs,
      ).not.toHaveBeenCalled();
    });
  });

  describe('polling interval registration', () => {
    it('registers a single setInterval via addIntervalToTerminalHandlers across multiple polling cycles', async () => {
      // Need NODE_ENV != 'test' for the setInterval branch to fire.
      process.env.NODE_ENV = 'production';
      const clientOpts = makeClientOpts(undefined);

      await syncClientConfig(clientOpts, [], IDENTIFYING_METADATA);
      await syncClientConfig(clientOpts, [], IDENTIFYING_METADATA);
      await syncClientConfig(clientOpts, [], IDENTIFYING_METADATA);

      expect(mockedSignals.addIntervalToTerminalHandlers).toHaveBeenCalledTimes(
        1,
      );
      const registeredTimer =
        mockedSignals.addIntervalToTerminalHandlers.mock.calls[0][0];
      expect(registeredTimer).toBeDefined();
      // Mock doesn't clear; do it manually so the interval doesn't fire post-test.
      clearInterval(registeredTimer as NodeJS.Timeout);
    });

    it('does not register via addTimeoutToTerminalHandlers (intervals only)', async () => {
      process.env.NODE_ENV = 'production';
      const clientOpts = makeClientOpts(undefined);

      await syncClientConfig(clientOpts, [], IDENTIFYING_METADATA);

      expect(mockedSignals.addTimeoutToTerminalHandlers).not.toHaveBeenCalled();
      const registeredTimer =
        mockedSignals.addIntervalToTerminalHandlers.mock.calls[0]?.[0];
      if (registeredTimer) clearInterval(registeredTimer as NodeJS.Timeout);
    });
  });

  describe('re-entrancy coalescing', () => {
    it('coalesces a concurrent call into exactly one follow-up cycle', async () => {
      delete process.env.SKIP_REMOTE_CONFIG;
      let resolveFirst: (() => void) | undefined;
      mockedRemoteConnectionSync.retrieveAndLoadRemoteConfigSync.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirst = resolve;
          }),
      );
      mockedRemoteConnectionSync.retrieveAndLoadRemoteConfigSync.mockResolvedValue(
        undefined,
      );

      const clientOpts = makeClientOpts(undefined);
      const firstCall = syncClientConfig(clientOpts, [], IDENTIFYING_METADATA);
      const secondCall = syncClientConfig(clientOpts, [], IDENTIFYING_METADATA);

      await secondCall;
      // Second call returned immediately (coalesced) — only the first cycle has started.
      expect(
        mockedRemoteConnectionSync.retrieveAndLoadRemoteConfigSync,
      ).toHaveBeenCalledTimes(1);

      resolveFirst!();
      await firstCall;

      // Follow-up cycle ran exactly once after the first completed.
      expect(
        mockedRemoteConnectionSync.retrieveAndLoadRemoteConfigSync,
      ).toHaveBeenCalledTimes(2);
    });

    it('collapses multiple concurrent calls to a single follow-up cycle', async () => {
      delete process.env.SKIP_REMOTE_CONFIG;
      let resolveFirst: (() => void) | undefined;
      mockedRemoteConnectionSync.retrieveAndLoadRemoteConfigSync.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirst = resolve;
          }),
      );
      mockedRemoteConnectionSync.retrieveAndLoadRemoteConfigSync.mockResolvedValue(
        undefined,
      );

      const clientOpts = makeClientOpts(undefined);
      const firstCall = syncClientConfig(clientOpts, [], IDENTIFYING_METADATA);
      // Three concurrent calls during the first in-flight sync.
      await Promise.all([
        syncClientConfig(clientOpts, [], IDENTIFYING_METADATA),
        syncClientConfig(clientOpts, [], IDENTIFYING_METADATA),
        syncClientConfig(clientOpts, [], IDENTIFYING_METADATA),
      ]);

      resolveFirst!();
      await firstCall;

      // First cycle + exactly one coalesced follow-up = 2 total, not 4.
      expect(
        mockedRemoteConnectionSync.retrieveAndLoadRemoteConfigSync,
      ).toHaveBeenCalledTimes(2);
    });

    it('skips the queued follow-up cycle if shutdown begins mid-sync', async () => {
      delete process.env.SKIP_REMOTE_CONFIG;
      let resolveFirst: (() => void) | undefined;
      mockedRemoteConnectionSync.retrieveAndLoadRemoteConfigSync.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirst = resolve;
          }),
      );
      mockedRemoteConnectionSync.retrieveAndLoadRemoteConfigSync.mockResolvedValue(
        undefined,
      );

      const clientOpts = makeClientOpts(undefined);
      const firstCall = syncClientConfig(clientOpts, [], IDENTIFYING_METADATA);
      await syncClientConfig(clientOpts, [], IDENTIFYING_METADATA); // queues follow-up

      // Shutdown begins before the first cycle finishes.
      mockedSignals.isShuttingDown.mockReturnValue(true);
      resolveFirst!();
      await firstCall;

      // Only the first cycle ran; the queued follow-up was skipped.
      expect(
        mockedRemoteConnectionSync.retrieveAndLoadRemoteConfigSync,
      ).toHaveBeenCalledTimes(1);
    });

    it('allows a subsequent call after the first completes', async () => {
      delete process.env.SKIP_REMOTE_CONFIG;
      mockedRemoteConnectionSync.retrieveAndLoadRemoteConfigSync.mockResolvedValue(
        undefined,
      );
      const clientOpts = makeClientOpts(undefined);

      await syncClientConfig(clientOpts, [], IDENTIFYING_METADATA);
      await syncClientConfig(clientOpts, [], IDENTIFYING_METADATA);

      expect(
        mockedRemoteConnectionSync.retrieveAndLoadRemoteConfigSync,
      ).toHaveBeenCalledTimes(2);
    });
  });

  it('should re-run plugins when contexts change on an existing connection', async () => {
    const clientOpts = makeClientOpts({
      'my-conn': {
        type: 'github',
        identifier: 'token-1',
        friendlyName: 'my-conn',
        contexts: {
          'ctx-new': { SOME_PARAM: 'value' },
        },
      },
    });
    // Existing websocket has the same identifier but was created without contexts
    const wsConns: WebSocketConnection[] = [
      makeWsConn('my-conn', 'token-1'),
      makeWsConn('my-conn', 'token-1'),
    ];
    await syncClientConfig(clientOpts, wsConns, IDENTIFYING_METADATA);

    // Expect plugins to be re-run for the changed contexts
    expect(mockedPluginManager.runStartupPlugins).toHaveBeenCalledWith(
      clientOpts,
      'my-conn',
    );
    // Stored contexts should be updated in the synchronizer state
    const expectedContexts = { 'ctx-new': { SOME_PARAM: 'value' } };
    expect(syncStateByConnection.get('my-conn')?.contexts).toEqual(
      expectedContexts,
    );
  });
});
