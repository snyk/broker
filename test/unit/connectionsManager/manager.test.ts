import { manageWebsocketConnections } from '../../../lib/hybrid-sdk/client/connectionsManager/manager';
import {
  IdentifyingMetadata,
  Role,
} from '../../../lib/hybrid-sdk/client/types/client';
import { LoadedClientOpts } from '../../../lib/hybrid-sdk/common/types/options';
import { log as logger } from '../../../lib/logs/logger';
import * as signals from '../../../lib/hybrid-sdk/common/utils/signals';

describe('Connections Manager', () => {
  it('Returns websocket connections empty array by default', async () => {
    process.env.SKIP_REMOTE_CONFIG = 'true';
    const config: LoadedClientOpts = {
      loadedFilters: new Map<string, any>(),
      port: 0,
      config: {
        supportedBrokerTypes: [],
        filterRulesPaths: {},
        brokerType: 'client',
      },
      filters: new Map<string, any>(),
    };
    const globalIdentifyingMetadata: IdentifyingMetadata = {
      capabilities: [],
      clientId: '',
      filters: new Map<string, any>(),
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
    const wsConnections = await manageWebsocketConnections(
      config,
      globalIdentifyingMetadata,
    );
    expect(wsConnections).toHaveLength(0);
  });

  describe('log levels (PR 2 contract)', () => {
    let infoSpy: jest.SpyInstance;
    let debugSpy: jest.SpyInstance;

    beforeEach(() => {
      infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});
      debugSpy = jest.spyOn(logger, 'debug').mockImplementation(() => {});
    });
    afterEach(() => jest.restoreAllMocks());

    it('logs "Received process termination signal." at INFO, not DEBUG', async () => {
      process.env.SKIP_REMOTE_CONFIG = 'true';
      let capturedCallback: (() => void) | undefined;
      jest
        .spyOn(signals, 'handleTerminationSignal')
        .mockImplementation((cb) => {
          capturedCallback = cb;
        });

      const config: LoadedClientOpts = {
        loadedFilters: new Map<string, any>(),
        port: 0,
        config: {
          supportedBrokerTypes: [],
          filterRulesPaths: {},
          brokerType: 'client',
        },
        filters: new Map<string, any>(),
      };
      const meta: IdentifyingMetadata = {
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

      await manageWebsocketConnections(config, meta);

      expect(capturedCallback).toBeDefined();
      capturedCallback!();

      expect(infoSpy).toHaveBeenCalledWith(
        expect.anything(),
        'Received process termination signal.',
      );
      expect(debugSpy).not.toHaveBeenCalledWith(
        expect.anything(),
        'Received process termination signal.',
      );
    });
  });
});
