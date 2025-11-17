import { createWebSocket } from '../../../lib/hybrid-sdk/client/socket';
import { setAuthConfigKey } from '../../../lib/hybrid-sdk/client/auth/oauth';
import {
  LoadedClientOpts,
  CONFIGURATION,
} from '../../../lib/hybrid-sdk/common/types/options';
import {
  IdentifyingMetadata,
  Role,
} from '../../../lib/hybrid-sdk/client/types/client';
import { log as logger } from '../../../lib/logs/logger';

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

jest.useFakeTimers();

describe('createWebSocket - renew auth behaviour', () => {
  let mockRenewBrokerServerConnection: jest.SpyInstance;
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

    mockProcessExit = jest.spyOn(process, 'exit').mockImplementation(() => {
      return undefined as never;
    }) as jest.SpyInstance;

    mockLoggerFatal = jest.spyOn(logger, 'fatal').mockImplementation();

    setAuthConfigKey('accessToken', undefined);
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
      const expiresInSec = 3600;
      setAuthConfigKey('accessToken', {
        expiresIn: expiresInSec,
        authHeader: 'Bearer test-token',
      });

      const clientOpts = createMockClientOpts();
      const identifyingMetadata = createMockIdentifyingMetadata();

      const ws = createWebSocket(clientOpts, identifyingMetadata, Role.primary);

      mockRenewBrokerServerConnection.mockResolvedValue({
        statusCode,
        headers: {},
        body: '{}',
      });

      const expectedTimeoutMs = (expiresInSec - 60) * 1000;

      // First timeout
      jest.advanceTimersByTime(expectedTimeoutMs);
      await Promise.resolve();

      expect(mockRenewBrokerServerConnection).toHaveBeenCalledTimes(1);
      expect(mockProcessExit).not.toHaveBeenCalled();

      // Second timeout - should retry
      jest.advanceTimersByTime(expectedTimeoutMs);
      await Promise.resolve();

      expect(mockRenewBrokerServerConnection).toHaveBeenCalledTimes(2);

      clearTimeout(ws.timeoutHandlerId);
    });

    it('should call renewBrokerServerConnection with correct parameters on 2XX', async () => {
      const expiresInSec = 3600; // 1 hour
      setAuthConfigKey('accessToken', {
        expiresIn: expiresInSec,
        authHeader: 'Bearer test-token',
      });

      const clientOpts = createMockClientOpts();
      const identifyingMetadata = createMockIdentifyingMetadata();

      const websocket = createWebSocket(
        clientOpts,
        identifyingMetadata,
        Role.primary,
      );

      const expectedTimeoutMs = (expiresInSec - 60) * 1000;

      mockRenewBrokerServerConnection.mockResolvedValue({
        statusCode: 200,
        headers: {},
        body: '{}',
      });

      jest.advanceTimersByTime(expectedTimeoutMs);
      await Promise.resolve();

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
      });
    });
  });

  describe('Client error case (4XX status)', () => {
    it.each([
      { statusCode: 401, description: '401 Unauthorized' },
      { statusCode: 403, description: '403 Forbidden' },
    ])(
      'should log fatal and exit process on $description',
      async ({ statusCode }) => {
        const expiresInSec = 3600;
        setAuthConfigKey('accessToken', {
          expiresIn: expiresInSec,
          authHeader: 'Bearer test-token',
        });

        const clientOpts = createMockClientOpts();
        const identifyingMetadata = createMockIdentifyingMetadata();

        const ws = createWebSocket(
          clientOpts,
          identifyingMetadata,
          Role.primary,
        );

        mockRenewBrokerServerConnection.mockResolvedValue({
          statusCode,
          headers: {},
          body: '{}',
        });

        const expectedTimeoutMs = (expiresInSec - 60) * 1000;

        jest.advanceTimersByTime(expectedTimeoutMs);
        await Promise.resolve();

        clearTimeout(ws.timeoutHandlerId);

        expect(mockRenewBrokerServerConnection).toHaveBeenCalledTimes(1);
        expect(mockLoggerFatal).toHaveBeenCalledWith(
          expect.objectContaining({
            connection: expect.any(String),
            role: Role.primary,
            responseCode: statusCode,
          }),
          'Failed to renew connection due to a client error. Exiting...',
        );
        expect(mockProcessExit).toHaveBeenCalledWith(1);
      },
    );
  });

  describe('Conditional execution', () => {
    it.each([
      {
        name: 'accessToken is missing',
        setupAuth: () => setAuthConfigKey('accessToken', undefined),
        universalBrokerGA: undefined,
        shouldRenew: false,
      },
      {
        name: 'UNIVERSAL_BROKER_GA is false',
        setupAuth: () =>
          setAuthConfigKey('accessToken', {
            expiresIn: 3600,
            authHeader: 'Bearer test-token',
          }),
        universalBrokerGA: false,
        shouldRenew: false,
      },
      {
        name: 'UNIVERSAL_BROKER_GA is undefined',
        setupAuth: () =>
          setAuthConfigKey('accessToken', {
            expiresIn: 3600,
            authHeader: 'Bearer test-token',
          }),
        universalBrokerGA: undefined,
        shouldRenew: false,
      },
      {
        name: 'both accessToken and UNIVERSAL_BROKER_GA are present',
        setupAuth: () =>
          setAuthConfigKey('accessToken', {
            expiresIn: 3600,
            authHeader: 'Bearer test-token',
          }),
        universalBrokerGA: 'true',
        shouldRenew: true,
      },
    ])(
      'should handle renew auth when $name',
      async ({ setupAuth, universalBrokerGA, shouldRenew }) => {
        setupAuth();

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

        const expectedTimeoutMs = (3600 - 60) * 1000;

        jest.advanceTimersByTime(expectedTimeoutMs);
        await Promise.resolve();

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
