import { manageWebsocketConnections } from '../../../lib/client/connectionsManager/manager';
import { IdentifyingMetadata, Role } from '../../../lib/client/types/client';
import { LoadedClientOpts } from '../../../lib/common/types/options';

describe('Connections Manager', () => {
  it('Returns websocket connections empty array by default', async () => {
    process.env.SKIP_REMOTE_CONFIG = 'true';
    const config: LoadedClientOpts = {
      loadedFilters: new Map<string, any>(),
      port: 0,
      config: {},
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
      role: Role.primary,
    };
    const wsConnections = await manageWebsocketConnections(
      config,
      globalIdentifyingMetadata,
    );
    expect(wsConnections).toHaveLength(0);
  });
});
