/**
 * Regression tests for the SCM-response status logging in
 * `makeLegacyRequest` (lib/hybrid-sdk/requestsHelper.ts).
 *
 * The original code logged WARN only for `status > 404`, which silently
 * dropped 401 / 402 / 403 / 404 — exactly the customer-ticket cases
 * (token expired, scope wrong, repo gone). The fix is `status >= 400 &&
 * status !== 404`, matching the threshold used in the streaming SCM
 * path at downstream-post-stream-to-server.ts:541.
 *
 * These tests pin the new contract so the off-by-one cannot recur.
 */

import { log as logger } from '../../../../lib/logs/logger';
import { makeRequestToDownstream } from '../../../../lib/hybrid-sdk/http/request';
import {
  legacyStreaming,
  makeLegacyRequest,
} from '../../../../lib/hybrid-sdk/requestsHelper';

jest.mock('../../../../lib/logs/logger');
jest.mock('../../../../lib/hybrid-sdk/http/request', () => ({
  makeRequestToDownstream: jest.fn(),
}));

const mockedDownstream = makeRequestToDownstream as jest.MockedFunction<
  typeof makeRequestToDownstream
>;

const req: any = {
  url: 'https://scm.example.com/repos/owner/name',
  method: 'GET',
  headers: {},
};
const options: any = {
  socketMaxResponseLength: 20971520,
};
const logContext: any = { requestId: 'test-request' };

describe('makeLegacyRequest — SCM response status logging', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([401, 403, 405, 500, 502, 503])(
    'logs WARN when SCM returns %d',
    async (statusCode) => {
      mockedDownstream.mockResolvedValueOnce({
        statusCode,
        body: '',
        headers: {},
      } as any);
      const emitCallback = jest.fn();

      await makeLegacyRequest(req, emitCallback, logContext, options);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode,
          url: req.url,
        }),
        expect.stringContaining(
          '[Websocket Flow][Inbound] Non-2xx response from downstream SCM',
        ),
      );
    },
  );

  it.each([200, 201, 204, 301, 302, 404])(
    'does NOT log WARN when SCM returns %d',
    async (statusCode) => {
      mockedDownstream.mockResolvedValueOnce({
        statusCode,
        body: '',
        headers: {},
      } as any);
      const emitCallback = jest.fn();

      await makeLegacyRequest(req, emitCallback, logContext, options);

      // Regression guard for the old `status > 404` threshold: 401/402/403
      // used to be silenced because the old test was `> 404` not `>= 400`.
      // 404 stays silent intentionally (common SCM probe pattern); the new
      // threshold is `>= 400 && !== 404`. 2xx/3xx also stay silent.
      expect(logger.warn).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining(
          '[Websocket Flow][Inbound] Non-2xx response from downstream SCM',
        ),
      );
    },
  );
});

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
