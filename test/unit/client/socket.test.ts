jest.mock('../../../lib/hybrid-sdk/client/auth/oauth', () => ({
  getAccessToken: jest.fn().mockResolvedValue('Bearer test-token'),
  getCachedAccessToken: jest.fn().mockReturnValue('Bearer test-token'),
  invalidateToken: jest.fn(),
  initOAuthClient: jest.fn(),
  isOAuthClientInitialized: jest.fn().mockReturnValue(true),
}));

jest.mock('../../../lib/hybrid-sdk/client/events', () => ({
  emitError: jest.fn(),
  emitShutdown: jest.fn(),
}));

import { createWebSocket } from '../../../lib/hybrid-sdk/client/socket';
import {
  LoadedClientOpts,
  CONFIGURATION,
} from '../../../lib/hybrid-sdk/common/types/options';
import {
  IdentifyingMetadata,
  Role,
} from '../../../lib/hybrid-sdk/client/types/client';
import { log as logger } from '../../../lib/logs/logger';
import { emitError, emitShutdown } from '../../../lib/hybrid-sdk/client/events';
import { PROCESS_EXIT_REASONS } from '../../../lib/hybrid-sdk/common/types/telemetry';

jest.mock('primus', () => {
  const mockSocket = jest.fn().mockImplementation(() => {
    return {
      transport: {
        extraHeaders: {},
      },
      on: jest.fn(),
      emit: jest.fn(),
    };
  });
  return {
    __esModule: true,
    default: {
      createSocket: jest.fn(() => mockSocket),
    },
  };
});

jest.mock('../../../lib/hybrid-sdk/http/utils', () => ({
  addServerIdAndRoleQS: jest.fn((url) => url),
}));

jest.mock('../../../lib/hybrid-sdk/client/socketHandlers/init', () => ({
  initializeSocketHandlers: jest.fn(),
}));

jest.mock(
  '../../../lib/hybrid-sdk/client/socketHandlers/identifyHandler',
  () => ({
    identifyHandler: jest.fn(),
  }),
);

jest.mock(
  '../../../lib/hybrid-sdk/client/socketHandlers/reconnectHandler',
  () => ({
    reconnectScheduledHandler: jest.fn(),
    reconnectFailedHandler: jest.fn(),
  }),
);

jest.mock('../../../lib/hybrid-sdk/client/socketHandlers/errorHandler', () => ({
  errorHandler: jest.fn(),
}));

jest.mock('../../../lib/hybrid-sdk/client/socketHandlers/openHandler', () => ({
  openHandler: jest.fn(),
}));

jest.mock('../../../lib/hybrid-sdk/client/socketHandlers/closeHandler', () => ({
  closeHandler: jest.fn(),
}));

jest.mock(
  '../../../lib/hybrid-sdk/client/socketHandlers/requestHandler',
  () => ({
    requestHandler: jest.fn(() => jest.fn()),
  }),
);

jest.mock('../../../lib/hybrid-sdk/client/socketHandlers/chunkHandler', () => ({
  chunkHandler: jest.fn(() => jest.fn()),
}));

jest.mock(
  '../../../lib/hybrid-sdk/client/socketHandlers/notificationHandler',
  () => ({
    notificationHandler: jest.fn(),
  }),
);

jest.mock(
  '../../../lib/hybrid-sdk/client/socketHandlers/serviceHandler',
  () => ({
    serviceHandler: jest.fn(),
  }),
);

jest.mock('../../../lib/hybrid-sdk/client/auth/brokerServerConnection', () => ({
  renewBrokerServerConnection: jest.fn(),
}));

const mockShutDownConnectionPair = jest.fn();
jest.mock(
  '../../../lib/hybrid-sdk/client/connectionsManager/connectionHelpers',
  () => ({
    shutDownConnectionPair: (...args: any[]) =>
      mockShutDownConnectionPair(...args),
  }),
);

jest.useFakeTimers();

describe('createWebSocket - renew auth behaviour', () => {
  let mockRenewBrokerServerConnection: jest.SpyInstance;
  let mockInvalidateToken: jest.SpyInstance;
  let mockProcessExit: jest.SpyInstance;
  let mockLoggerFatal: jest.SpyInstance;

  const createMockClientOpts = (
    overrides?: Partial<LoadedClientOpts>,
  ): LoadedClientOpts => {
    const baseConfig: CONFIGURATION = {
      supportedBrokerTypes: [],
      brokerType: 'client',
      filterRulesPaths: {},
      brokerServerUrl: 'http://localhost:8000',
      brokerToken: 'test-broker-token',
      API_BASE_URL: 'http://api.example.com',
      UNIVERSAL_BROKER_GA: 'true',
    };
    return {
      port: 8000,
      config: baseConfig,
      ...overrides,
    };
  };

  const createMockIdentifyingMetadata = (
    overrides?: Partial<IdentifyingMetadata>,
  ): IdentifyingMetadata => {
    return {
      clientId: 'test-client-id',
      identifier: 'test-identifier',
      id: 'test-id',
      isDisabled: false,
      version: '1.0.0',
      capabilities: [],
      filters: new Map(),
      preflightChecks: undefined,
      role: Role.primary,
      clientConfig: {
        brokerClientId: 'test-client-id',
        version: '1.0.0',
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
      },
      ...overrides,
    };
  };

  beforeEach(() => {
    jest.clearAllTimers();
    jest.clearAllMocks();

    mockRenewBrokerServerConnection =
      require('../../../lib/hybrid-sdk/client/auth/brokerServerConnection').renewBrokerServerConnection;
    mockRenewBrokerServerConnection.mockResolvedValue({
      statusCode: 200,
      headers: {},
      body: '{}',
    });

    mockInvalidateToken =
      require('../../../lib/hybrid-sdk/client/auth/oauth').invalidateToken;

    mockProcessExit = jest.spyOn(process, 'exit').mockImplementation(() => {
      return undefined as never;
    }) as jest.SpyInstance;

    mockLoggerFatal = jest.spyOn(logger, 'fatal').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.restoreAllMocks();
  });

  describe('Retry cases (2XX, 3XX, 5XX, undefined)', () => {
    it.each([
      {
        description: '2XX status (success)',
        statusCode: 200,
      },
      {
        description: '5XX status',
        statusCode: 500,
      },
      {
        description: 'undefined statusCode',
        statusCode: undefined,
      },
      {
        description: '3XX status',
        statusCode: 301,
      },
    ])('should retry on $description', async ({ statusCode }) => {
      const clientOpts = createMockClientOpts();
      const identifyingMetadata = createMockIdentifyingMetadata();

      const ws = createWebSocket(clientOpts, identifyingMetadata, Role.primary);

      mockRenewBrokerServerConnection.mockResolvedValue({
        statusCode,
        headers: {},
        body: '{}',
      });

      const expectedTimeoutMs = 10 * 60 * 1000;

      // First timeout
      await jest.advanceTimersByTimeAsync(expectedTimeoutMs);

      expect(mockRenewBrokerServerConnection).toHaveBeenCalledTimes(1);
      expect(mockProcessExit).not.toHaveBeenCalled();

      // Second timeout - should retry
      await jest.advanceTimersByTimeAsync(expectedTimeoutMs);

      expect(mockRenewBrokerServerConnection).toHaveBeenCalledTimes(2);

      clearTimeout(ws.timeoutHandlerId);
    });

    it('should call renewBrokerServerConnection with correct parameters on 2XX', async () => {
      const clientOpts = createMockClientOpts();
      const identifyingMetadata = createMockIdentifyingMetadata();

      const websocket = createWebSocket(
        clientOpts,
        identifyingMetadata,
        Role.primary,
      );

      const expectedTimeoutMs = 10 * 60 * 1000;

      mockRenewBrokerServerConnection.mockResolvedValue({
        statusCode: 200,
        headers: {},
        body: '{}',
      });

      await jest.advanceTimersByTimeAsync(expectedTimeoutMs);

      clearTimeout(websocket.timeoutHandlerId);

      expect(mockRenewBrokerServerConnection).toHaveBeenCalledTimes(1);
      expect(mockRenewBrokerServerConnection).toHaveBeenCalledWith(
        {
          connectionIdentifier: 'test-identifier',
          brokerClientId: 'test-client-id',
          authorization: 'Bearer test-token',
          role: Role.primary,
          serverId: undefined,
        },
        clientOpts.config,
      );

      expect(websocket.transport.extraHeaders).toEqual({
        Authorization: 'Bearer test-token',
        'x-snyk-broker-client-id': 'test-client-id',
        'x-snyk-broker-client-role': Role.primary,
        'x-broker-client-version': expect.any(String),
        'snyk-request-id': expect.any(String),
      });
    });
  });

  describe('Client error case (4XX status)', () => {
    it('should not exit on a single 4XX; warns and reschedules', async () => {
      const mockLoggerWarn = jest.spyOn(logger, 'warn').mockImplementation();
      const clientOpts = createMockClientOpts();
      const identifyingMetadata = createMockIdentifyingMetadata();

      const ws = createWebSocket(clientOpts, identifyingMetadata, Role.primary);

      mockRenewBrokerServerConnection.mockResolvedValue({
        statusCode: 403,
        headers: {},
        body: '{}',
      });

      const expectedTimeoutMs = 10 * 60 * 1000;

      await jest.advanceTimersByTimeAsync(expectedTimeoutMs);

      expect(mockLoggerFatal).not.toHaveBeenCalled();
      expect(mockProcessExit).not.toHaveBeenCalled();
      // A non-401 failure must still drop the token so the next attempt refreshes.
      expect(mockInvalidateToken).toHaveBeenCalled();
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.objectContaining({
          connection: expect.any(String),
          role: Role.primary,
          responseCode: 403,
          consecutiveAuthFailures: 1,
        }),
        'Failed to renew connection.',
      );
      // Non-fatal renewal failure surfaces as a client-error event.
      expect(emitError).toHaveBeenCalledWith({
        errorCode: 'AUTH_RENEWAL_FAILED',
      });
      expect(ws.timeoutHandlerId).toBeDefined();

      clearTimeout(ws.timeoutHandlerId);
    });

    it('should retry once on 401 and succeed without exiting', async () => {
      const clientOpts = createMockClientOpts();
      const identifyingMetadata = createMockIdentifyingMetadata();

      const ws = createWebSocket(clientOpts, identifyingMetadata, Role.primary);

      mockRenewBrokerServerConnection
        .mockResolvedValueOnce({ statusCode: 401, headers: {}, body: '{}' })
        .mockResolvedValueOnce({ statusCode: 200, headers: {}, body: '{}' });

      const expectedTimeoutMs = 10 * 60 * 1000;

      await jest.advanceTimersByTimeAsync(expectedTimeoutMs);

      clearTimeout(ws.timeoutHandlerId);

      expect(mockRenewBrokerServerConnection).toHaveBeenCalledTimes(2);
      expect(mockInvalidateToken).toHaveBeenCalledTimes(1);
      expect(mockLoggerFatal).not.toHaveBeenCalled();
      expect(mockProcessExit).not.toHaveBeenCalled();
    });

    it('should count a 401 that survives its retry as a single failure (no exit)', async () => {
      const clientOpts = createMockClientOpts();
      const identifyingMetadata = createMockIdentifyingMetadata();

      const ws = createWebSocket(clientOpts, identifyingMetadata, Role.primary);

      mockRenewBrokerServerConnection.mockResolvedValue({
        statusCode: 401,
        headers: {},
        body: '{}',
      });

      const expectedTimeoutMs = 10 * 60 * 1000;

      await jest.advanceTimersByTimeAsync(expectedTimeoutMs);

      expect(mockRenewBrokerServerConnection).toHaveBeenCalledTimes(2);
      // Once in the in-cycle 401 retry, once in the catch so the next cycle refreshes.
      expect(mockInvalidateToken).toHaveBeenCalledTimes(2);
      expect(mockLoggerFatal).not.toHaveBeenCalled();
      expect(mockProcessExit).not.toHaveBeenCalled();

      clearTimeout(ws.timeoutHandlerId);
    });

    it('should exit with oauth_token_unavailable after N consecutive failures and reset on success', async () => {
      const recordProcessExitSpy = jest.spyOn(
        require('../../../lib/hybrid-sdk/client/metrics/noopClient').NoopClient
          .prototype,
        'recordProcessExit',
      );
      const clientOpts = createMockClientOpts();
      const identifyingMetadata = createMockIdentifyingMetadata();

      const ws = createWebSocket(clientOpts, identifyingMetadata, Role.primary);

      const expectedTimeoutMs = 10 * 60 * 1000;
      const fail = () =>
        mockRenewBrokerServerConnection.mockResolvedValue({
          statusCode: 403,
          headers: {},
          body: '{}',
        });
      const succeed = () =>
        mockRenewBrokerServerConnection.mockResolvedValue({
          statusCode: 200,
          headers: {},
          body: '{}',
        });

      // Two failures, then a success resets the counter.
      fail();
      await jest.advanceTimersByTimeAsync(expectedTimeoutMs);
      await jest.advanceTimersByTimeAsync(expectedTimeoutMs);
      succeed();
      await jest.advanceTimersByTimeAsync(expectedTimeoutMs);
      expect(mockProcessExit).not.toHaveBeenCalled();

      // Three consecutive failures from a reset counter trips the exit.
      fail();
      await jest.advanceTimersByTimeAsync(expectedTimeoutMs);
      await jest.advanceTimersByTimeAsync(expectedTimeoutMs);
      expect(mockProcessExit).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(expectedTimeoutMs);

      expect(mockLoggerFatal).toHaveBeenCalledWith(
        expect.objectContaining({
          connection: expect.any(String),
          role: Role.primary,
          responseCode: 403,
        }),
        expect.stringContaining('consecutive times. Exiting...'),
      );
      expect(recordProcessExitSpy).toHaveBeenCalledWith(
        PROCESS_EXIT_REASONS.OAUTH_TOKEN_UNAVAILABLE,
      );
      expect(emitShutdown).toHaveBeenCalledWith({
        reason: PROCESS_EXIT_REASONS.OAUTH_TOKEN_UNAVAILABLE,
        uptimeSeconds: expect.any(Number),
      });
      expect(mockProcessExit).toHaveBeenCalledWith(1);

      clearTimeout(ws.timeoutHandlerId);
    });

    it('universal mode: tears down only the failing connection (no process.exit) after N consecutive auth failures', async () => {
      const {
        websocketConnections,
      } = require('../../../lib/hybrid-sdk/client/connectionsManager/manager');
      websocketConnections.length = 0;

      const clientOpts = createMockClientOpts();
      clientOpts.config.universalBrokerEnabled = 'true';
      clientOpts.config.brokerRenewalConnectionScopedTeardownEnabled = true;

      const identifyingMetadata = createMockIdentifyingMetadata();
      identifyingMetadata.friendlyName = 'conn-A';

      const ws = createWebSocket(clientOpts, identifyingMetadata, Role.primary);
      // Seed the registry so findIndex(friendlyName) resolves.
      ws.friendlyName = 'conn-A';
      websocketConnections.push(ws);

      const expectedTimeoutMs = 10 * 60 * 1000;
      mockRenewBrokerServerConnection.mockResolvedValue({
        statusCode: 403,
        headers: {},
        body: '{}',
      });

      await jest.advanceTimersByTimeAsync(expectedTimeoutMs);
      await jest.advanceTimersByTimeAsync(expectedTimeoutMs);
      await jest.advanceTimersByTimeAsync(expectedTimeoutMs);

      expect(mockShutDownConnectionPair).toHaveBeenCalledTimes(1);
      expect(mockShutDownConnectionPair).toHaveBeenCalledWith(
        websocketConnections,
        0,
      );
      expect(mockProcessExit).not.toHaveBeenCalled();
      // Universal teardown must NOT emit client-shutdown (process is still running)
      expect(emitShutdown).not.toHaveBeenCalled();

      clearTimeout(ws.timeoutHandlerId);
    });

    it('universal mode: closes the socket directly when it is not in the registry (idx === -1)', async () => {
      const {
        websocketConnections,
      } = require('../../../lib/hybrid-sdk/client/connectionsManager/manager');
      websocketConnections.length = 0; // empty registry => findIndex returns -1

      const clientOpts = createMockClientOpts();
      clientOpts.config.universalBrokerEnabled = 'true';
      clientOpts.config.brokerRenewalConnectionScopedTeardownEnabled = true;

      const identifyingMetadata = createMockIdentifyingMetadata();
      identifyingMetadata.friendlyName = 'conn-orphan';

      const ws = createWebSocket(clientOpts, identifyingMetadata, Role.primary);
      ws.end = jest.fn();
      ws.destroy = jest.fn();
      // Intentionally NOT pushed into websocketConnections, so idx === -1.

      const expectedTimeoutMs = 10 * 60 * 1000;
      mockRenewBrokerServerConnection.mockResolvedValue({
        statusCode: 403,
        headers: {},
        body: '{}',
      });

      await jest.advanceTimersByTimeAsync(expectedTimeoutMs);
      await jest.advanceTimersByTimeAsync(expectedTimeoutMs);
      await jest.advanceTimersByTimeAsync(expectedTimeoutMs);

      expect(mockShutDownConnectionPair).not.toHaveBeenCalled();
      expect(ws.end).toHaveBeenCalledTimes(1);
      expect(ws.destroy).toHaveBeenCalledTimes(1);
      expect(mockProcessExit).not.toHaveBeenCalled();

      clearTimeout(ws.timeoutHandlerId);
    });
  });

  describe('Thrown error during renewal', () => {
    it('should reschedule and not crash when getAccessToken rejects', async () => {
      const {
        getAccessToken,
      } = require('../../../lib/hybrid-sdk/client/auth/oauth');
      const mockLoggerWarn = jest.spyOn(logger, 'warn').mockImplementation();
      const recordAuthRenewalFailureSpy = jest.spyOn(
        require('../../../lib/hybrid-sdk/client/metrics/noopClient').NoopClient
          .prototype,
        'recordAuthRenewalFailure',
      );

      (getAccessToken as jest.Mock)
        .mockRejectedValueOnce(new Error('oauth unreachable'))
        .mockResolvedValue('Bearer test-token');

      const clientOpts = createMockClientOpts();
      const identifyingMetadata = createMockIdentifyingMetadata();
      const ws = createWebSocket(clientOpts, identifyingMetadata, Role.primary);

      const expectedTimeoutMs = 10 * 60 * 1000;

      // First tick: getAccessToken throws → handler should swallow and reschedule.
      await jest.advanceTimersByTimeAsync(expectedTimeoutMs);

      expect(mockRenewBrokerServerConnection).not.toHaveBeenCalled();
      expect(recordAuthRenewalFailureSpy).toHaveBeenCalledWith(0);
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.objectContaining({
          connection: expect.any(String),
          role: Role.primary,
          err: expect.any(Error),
        }),
        'Failed to renew connection.',
      );
      expect(mockProcessExit).not.toHaveBeenCalled();
      expect(ws.timeoutHandlerId).toBeDefined();

      // Second tick: loop survived and proceeds normally.
      await jest.advanceTimersByTimeAsync(expectedTimeoutMs);
      expect(mockRenewBrokerServerConnection).toHaveBeenCalledTimes(1);

      clearTimeout(ws.timeoutHandlerId);
    });

    it('should reschedule and not crash when renewBrokerServerConnection rejects', async () => {
      const mockLoggerWarn = jest.spyOn(logger, 'warn').mockImplementation();
      const recordAuthRenewalFailureSpy = jest.spyOn(
        require('../../../lib/hybrid-sdk/client/metrics/noopClient').NoopClient
          .prototype,
        'recordAuthRenewalFailure',
      );

      mockRenewBrokerServerConnection
        .mockRejectedValueOnce(new Error('socket hang up'))
        .mockResolvedValueOnce({ statusCode: 200, headers: {}, body: '{}' });

      const clientOpts = createMockClientOpts();
      const identifyingMetadata = createMockIdentifyingMetadata();
      const ws = createWebSocket(clientOpts, identifyingMetadata, Role.primary);

      const expectedTimeoutMs = 10 * 60 * 1000;

      // First tick: renewal throws → handler should swallow and reschedule.
      await jest.advanceTimersByTimeAsync(expectedTimeoutMs);

      expect(mockRenewBrokerServerConnection).toHaveBeenCalledTimes(1);
      expect(recordAuthRenewalFailureSpy).toHaveBeenCalledWith(0);
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.objectContaining({
          connection: expect.any(String),
          role: Role.primary,
          err: expect.any(Error),
        }),
        'Failed to renew connection.',
      );
      expect(mockProcessExit).not.toHaveBeenCalled();
      expect(ws.timeoutHandlerId).toBeDefined();

      // Second tick: loop survived and the 200 response is honored.
      await jest.advanceTimersByTimeAsync(expectedTimeoutMs);
      expect(mockRenewBrokerServerConnection).toHaveBeenCalledTimes(2);

      clearTimeout(ws.timeoutHandlerId);
    });
  });

  describe('error handling', () => {
    it('invalidates the cached token on a websocket error when OAuth is in use', async () => {
      const clientOpts = createMockClientOpts();
      const identifyingMetadata = createMockIdentifyingMetadata();
      const ws = createWebSocket(clientOpts, identifyingMetadata, Role.primary);

      const errorHandlers = (ws.on as jest.Mock).mock.calls
        .filter(([event]) => event === 'error')
        .map(([, handler]) => handler);
      expect(errorHandlers.length).toBeGreaterThan(0);

      errorHandlers.forEach((handler) =>
        handler({ type: 'TransportError', description: 'boom' }),
      );

      expect(mockInvalidateToken).toHaveBeenCalled();

      clearTimeout(ws.timeoutHandlerId);
    });
  });

  describe('reconnect scheduled', () => {
    it('updates extraHeaders synchronously without awaiting getAccessToken', async () => {
      const {
        getAccessToken,
        getCachedAccessToken,
      } = require('../../../lib/hybrid-sdk/client/auth/oauth');
      (getCachedAccessToken as jest.Mock).mockReturnValue('Bearer cached');

      const clientOpts = createMockClientOpts();
      const identifyingMetadata = createMockIdentifyingMetadata();
      const ws = createWebSocket(clientOpts, identifyingMetadata, Role.primary);

      const reconnectHandler = (ws.on as jest.Mock).mock.calls.find(
        ([event]) => event === 'reconnect scheduled',
      )?.[1];
      expect(reconnectHandler).toBeDefined();
      expect(reconnectHandler.constructor.name).toBe('Function');
      expect(reconnectHandler.constructor.name).not.toBe('AsyncFunction');

      const opts = { attempt: 1, retries: 3, scheduled: 5000 };
      (getAccessToken as jest.Mock).mockClear();
      reconnectHandler(opts);

      expect(getAccessToken).not.toHaveBeenCalled();
      expect(ws.transport.extraHeaders).toMatchObject({
        Authorization: 'Bearer cached',
        'snyk-request-id': expect.any(String),
      });
    });
  });

  describe('reconnect failed', () => {
    it('does NOT emit a client-shutdown (socket is already gone — undeliverable)', () => {
      const clientOpts = createMockClientOpts();
      const identifyingMetadata = createMockIdentifyingMetadata();
      const ws = createWebSocket(clientOpts, identifyingMetadata, Role.primary);

      const reconnectFailed = (ws.on as jest.Mock).mock.calls.find(
        ([event]) => event === 'reconnect failed',
      )?.[1];
      expect(reconnectFailed).toBeDefined();

      reconnectFailed();

      // reconnect_exhaustion is reported via the process_exit metric, not a WS
      // event — by this point 'close' has cleared the event socket.
      expect(emitShutdown).not.toHaveBeenCalled();
    });
  });

  describe('Conditional execution', () => {
    it.each([
      {
        name: 'UNIVERSAL_BROKER_GA is false',
        universalBrokerGA: false,
        shouldRenew: false,
      },
      {
        name: 'UNIVERSAL_BROKER_GA is undefined',
        universalBrokerGA: undefined,
        shouldRenew: false,
      },
      {
        name: 'UNIVERSAL_BROKER_GA is "true"',
        universalBrokerGA: 'true',
        shouldRenew: true,
      },
    ])(
      'should handle renew auth when $name',
      async ({ universalBrokerGA, shouldRenew }) => {
        const baseOpts = createMockClientOpts();
        const clientOpts = createMockClientOpts({
          config: {
            ...baseOpts.config,
            UNIVERSAL_BROKER_GA: universalBrokerGA,
          },
        });
        const identifyingMetadata = createMockIdentifyingMetadata();

        if (shouldRenew) {
          mockRenewBrokerServerConnection.mockResolvedValue({
            statusCode: 200,
            headers: {},
            body: '{}',
          });
        }

        const ws = createWebSocket(
          clientOpts,
          identifyingMetadata,
          Role.primary,
        );

        const expectedTimeoutMs = 10 * 60 * 1000;

        await jest.advanceTimersByTimeAsync(expectedTimeoutMs);

        clearTimeout(ws.timeoutHandlerId);

        if (shouldRenew) {
          expect(mockRenewBrokerServerConnection).toHaveBeenCalledTimes(1);
        } else {
          expect(mockRenewBrokerServerConnection).not.toHaveBeenCalled();
        }
      },
    );
  });
});
