import { log as logger } from '../../../lib/logs/logger';
import { handleUncaughtException } from '../../../lib/hybrid-sdk/client/index';

describe('handleUncaughtException — log levels (PR 8 contract)', () => {
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  // Minimal stub of the metrics client surface the handler touches.
  const metricsClientStub: any = {
    recordUncaughtException: jest.fn(),
    recordProcessExit: jest.fn(),
    forceFlush: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('logs "ECONNRESETs Catch all:" at WARN, not ERROR, on a read ECONNRESET', () => {
    const econnreset = new Error('read ECONNRESET');
    handleUncaughtException(econnreset, metricsClientStub);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ msg: 'read ECONNRESET' }),
      'ECONNRESETs Catch all:',
      'read ECONNRESET',
    );
    expect(errorSpy).not.toHaveBeenCalledWith(
      expect.anything(),
      'ECONNRESETs Catch all:',
      expect.anything(),
    );
    // Sanity: the metrics counter that already covers ECONNRESET observability
    // still runs (we explicitly did NOT add a new counter — see plan).
    expect(metricsClientStub.recordUncaughtException).toHaveBeenCalled();
  });
});
