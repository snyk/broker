import { manageWebsocketConnections } from '../../../lib/hybrid-sdk/client/connectionsManager/manager';
import {
  IdentifyingMetadata,
  Role,
} from '../../../lib/hybrid-sdk/client/types/client';
import { LoadedClientOpts } from '../../../lib/hybrid-sdk/common/types/options';

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
});
