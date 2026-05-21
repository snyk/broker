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

describe('serviceHandler — config / filter reload log levels', () => {
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

describe('serviceHandler — unknown-command log level', () => {
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('logs "Unknown service message received." at WARN, not ERROR, on an unknown command', async () => {
    await serviceHandler({ url: '/unknown/command', headers: {} }, jest.fn());

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ command: '/unknown/command' }),
      'Unknown service message received.',
    );
    expect(errorSpy).not.toHaveBeenCalledWith(
      expect.anything(),
      'Unknown service message received.',
    );
  });
});
