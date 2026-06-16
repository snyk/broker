jest.mock('../../../lib/hybrid-sdk/client/events', () => ({
  emitError: jest.fn(),
  emitShutdown: jest.fn(),
}));

import { log as logger } from '../../../lib/logs/logger';
import { handleUncaughtException } from '../../../lib/hybrid-sdk/client/index';
import { emitShutdown } from '../../../lib/hybrid-sdk/client/events';
import { PROCESS_EXIT_REASONS } from '../../../lib/hybrid-sdk/common/types/telemetry';

describe('handleUncaughtException — log levels', () => {
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
    jest.spyOn(process, 'exit').mockImplementation((() => undefined) as any);
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

  it('does NOT emit a shutdown for a benign read ECONNRESET (no exit)', () => {
    handleUncaughtException(new Error('read ECONNRESET'), metricsClientStub);
    expect(emitShutdown).not.toHaveBeenCalled();
  });

  it('emits an uncaught_exception shutdown carrying the bounded errno code only', () => {
    const err = Object.assign(new Error('boom with secret detail'), {
      code: 'ECONNRESET',
    });

    handleUncaughtException(err, metricsClientStub);

    expect(emitShutdown).toHaveBeenCalledWith({
      reason: PROCESS_EXIT_REASONS.UNCAUGHT_EXCEPTION,
      uptimeSeconds: expect.any(Number),
      errorCode: 'ECONNRESET',
    });
    // The free-form error message must never ride the event.
    const emitted = (emitShutdown as jest.Mock).mock.calls[0][0];
    expect(JSON.stringify(emitted)).not.toContain('secret detail');
  });

  it('strips a non-standard third-party .code value (not in the known errno allowlist)', () => {
    const err = Object.assign(new Error('boom'), {
      code: 'ERR_TLS_CERT_ALTNAME_INVALID',
    });

    handleUncaughtException(err, metricsClientStub);

    const emitted = (emitShutdown as jest.Mock).mock.calls[0]?.[0];
    expect(emitted?.errorCode).toBeUndefined();
  });
});
