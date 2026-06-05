/**
 * Tests for `legacyStreaming` (lib/hybrid-sdk/requestsHelper.ts), the
 * capability-fallback streaming path still wired at responseSenders.ts.
 *
 * Pins that the fallback line is logged at INFO (a negotiation outcome),
 * not WARN (a degraded state).
 */

import { log as logger } from '../../../../lib/logs/logger';
import { legacyStreaming } from '../../../../lib/hybrid-sdk/requestsHelper';

jest.mock('../../../../lib/logs/logger');

const logContext: any = { requestId: 'test-request' };

describe('legacyStreaming — capability-fallback log level', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs the capability-fallback line at INFO, not WARN — it is a negotiation outcome, not a degraded state', () => {
    // Chainable stub: every `.on(event, cb)` returns `rqst` so the stream
    // wiring after the log call doesn't blow up.
    const rqst: any = {};
    rqst.on = jest.fn(() => rqst);
    const io: any = { send: jest.fn() };

    legacyStreaming(logContext, rqst, {}, io, 'stream-1');

    expect(logger.info).toHaveBeenCalledWith(
      expect.anything(),
      'Server did not advertise received-post-streams capability - falling back to legacy streaming.',
    );
    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.anything(),
      'Server did not advertise received-post-streams capability - falling back to legacy streaming.',
    );
  });
});
