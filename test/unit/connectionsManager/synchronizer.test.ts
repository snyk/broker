import {
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

jest.mock(
  '../../../lib/hybrid-sdk/client/connectionsManager/remoteConnectionSync',
);
jest.mock('../../../lib/hybrid-sdk/client/brokerClientPlugins/pluginManager');
jest.mock('../../../lib/hybrid-sdk/client/socket');
jest.mock(
  '../../../lib/hybrid-sdk/client/connectionsManager/connectionHelpers',
);

const mockedPluginManager = jest.mocked(pluginManager);
const mockedSocket = jest.mocked(socket);
const mockedConnectionHelpers = jest.mocked(connectionHelpers);

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
    syncStateByConnection.clear();
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
