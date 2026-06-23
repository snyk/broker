// Pin the level of the broker-client startup-failure log.
//
// `main()` in lib/hybrid-sdk/client/index.ts wraps the entire startup in
// try/catch and previously logged the failure at WARN. That hid a startup-
// fatal from operators whose alerting fires on ERROR only — broker silently
// failed to come up and the WARN line scrolled past with the metrics-client
// boot noise. This test pins the new ERROR level by forcing an early throw
// from validateMinimalConfig (the first awaited dependency inside the try
// block) and asserting the catch block emits at ERROR.

jest.mock('../../../lib/hybrid-sdk/client/hooks/startup/processHooks', () => ({
  validateMinimalConfig: jest.fn(),
  processStartUpHooks: jest.fn().mockResolvedValue({}),
}));
jest.mock('../../../lib/hybrid-sdk/client/metrics', () => ({
  createClient: jest.fn(() => ({
    incrementBrokerClientMetric: jest.fn(),
    recordUncaughtException: jest.fn(),
    recordProcessExit: jest.fn(),
    forceFlush: jest.fn().mockResolvedValue(undefined),
    shutdown: jest.fn().mockResolvedValue(undefined),
  })),
}));

import { main } from '../../../lib/hybrid-sdk/client/index';
import { log as logger } from '../../../lib/logs/logger';
import { validateMinimalConfig } from '../../../lib/hybrid-sdk/client/hooks/startup/processHooks';

const mockedValidate = jest.mocked(validateMinimalConfig);

describe('main() — startup-failure log level', () => {
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs "Shutting down client." at ERROR (not WARN) when startup fails', async () => {
    const bootError = new Error('boom — minimal config invalid');
    mockedValidate.mockRejectedValueOnce(bootError);

    const clientOpts: any = {
      config: {
        BROKER_SERVER_URL: 'https://broker.snyk.io',
      },
      port: 0,
    };

    await expect(main(clientOpts)).rejects.toBe(bootError);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ err: bootError }),
      'Shutting down client.',
    );
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.anything(),
      'Shutting down client.',
    );
  });
});
