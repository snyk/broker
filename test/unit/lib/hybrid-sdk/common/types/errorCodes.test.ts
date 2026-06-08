import {
  BROKER_ERROR_CODES,
  classifyDownstreamError,
  statusForErrorCode,
} from '../../../../../../lib/hybrid-sdk/common/types/errorCodes';

describe('errorCodes catalog', () => {
  describe('classifyDownstreamError', () => {
    it.each([
      ['ETIMEDOUT', BROKER_ERROR_CODES.DOWNSTREAM_TIMEOUT],
      ['ECONNREFUSED', BROKER_ERROR_CODES.DOWNSTREAM_UNREACHABLE],
      ['ENOTFOUND', BROKER_ERROR_CODES.DOWNSTREAM_UNREACHABLE],
    ])('maps errno %s to %s', (errno, expected) => {
      expect(
        classifyDownstreamError(Object.assign(new Error('x'), { code: errno })),
      ).toBe(expected);
    });

    it('maps ECONNRESET to DOWNSTREAM_ERROR (not unreachable/timeout)', () => {
      expect(
        classifyDownstreamError(
          Object.assign(new Error('reset'), { code: 'ECONNRESET' }),
        ),
      ).toBe(BROKER_ERROR_CODES.DOWNSTREAM_ERROR);
    });

    it('falls back to DOWNSTREAM_ERROR for an unknown errno', () => {
      expect(
        classifyDownstreamError(
          Object.assign(new Error('?'), { code: 'EWAT' }),
        ),
      ).toBe(BROKER_ERROR_CODES.DOWNSTREAM_ERROR);
    });

    it('falls back to DOWNSTREAM_ERROR for a code-less error', () => {
      expect(classifyDownstreamError(new Error('plain'))).toBe(
        BROKER_ERROR_CODES.DOWNSTREAM_ERROR,
      );
    });

    it('falls back to DOWNSTREAM_ERROR for undefined', () => {
      expect(classifyDownstreamError(undefined)).toBe(
        BROKER_ERROR_CODES.DOWNSTREAM_ERROR,
      );
    });
  });

  describe('statusForErrorCode', () => {
    it.each([
      [BROKER_ERROR_CODES.DOWNSTREAM_TIMEOUT, 504],
      [BROKER_ERROR_CODES.DOWNSTREAM_UNREACHABLE, 502],
      [BROKER_ERROR_CODES.DOWNSTREAM_ERROR, 502],
      [BROKER_ERROR_CODES.FILTER_BLOCKED, 401],
      [BROKER_ERROR_CODES.BODY_TOO_LARGE, 502],
    ])('returns %s -> %d', (code, status) => {
      expect(statusForErrorCode(code)).toBe(status);
    });
  });
});
