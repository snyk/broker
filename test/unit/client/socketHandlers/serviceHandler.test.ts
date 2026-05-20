import { log as logger } from '../../../../lib/logs/logger';
import { serviceHandler } from '../../../../lib/hybrid-sdk/client/socketHandlers/serviceHandler';

jest.mock('../../../../lib/hybrid-sdk/client/config/configHelpers', () => ({
  getClientOpts: jest.fn(() => ({ config: { universalBrokerEnabled: false } })),
}));
jest.mock(
  '../../../../lib/hybrid-sdk/client/connectionsManager/synchronizer',
  () => ({ syncClientConfig: jest.fn() }),
);
jest.mock(
  '../../../../lib/hybrid-sdk/client/connectionsManager/manager',
  () => ({
    getGlobalIdentifyingMetadata: jest.fn(() => ({})),
    getWebsocketConnections: jest.fn(() => []),
  }),
);

describe('serviceHandler — log levels (PR 2 contract)', () => {
  let infoSpy: jest.SpyInstance;
  let debugSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});
    debugSpy = jest.spyOn(logger, 'debug').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('logs "Reloading filters." at INFO, not DEBUG', async () => {
    await serviceHandler({ url: '/filters/reload', headers: {} }, jest.fn());

    expect(infoSpy).toHaveBeenCalledWith(
      expect.anything(),
      'Reloading filters.',
    );
    expect(debugSpy).not.toHaveBeenCalledWith(
      expect.anything(),
      'Reloading filters.',
    );
  });

  it('logs "Reloading config." at INFO, not DEBUG', async () => {
    await serviceHandler({ url: '/config/reload', headers: {} }, jest.fn());

    expect(infoSpy).toHaveBeenCalledWith(
      expect.anything(),
      'Reloading config.',
    );
    expect(debugSpy).not.toHaveBeenCalledWith(
      expect.anything(),
      'Reloading config.',
    );
  });
});
