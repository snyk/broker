import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { log as logger } from '../../../../logs/logger';
import { isUUID } from '../../utils/uuid';

/** Inbound headers inspected for an existing request ID, in priority order. */
const DEFAULT_INHERITED_HEADERS: ReadonlyArray<string> = [
  'x-akamai-request-id',
  'x-request-id',
  'snyk-request-id',
  'x-github-delivery',
  'x-gitlab-event-uuid',
];

/** Response header used to echo the resolved request ID back to the caller. */
const DEFAULT_RESPONSE_HEADER = 'snyk-request-id';

export interface RequestIdHeaderOptions {
  /** Headers to inspect for an existing request ID, checked in order. */
  incomingHeaders?: ReadonlyArray<string>;
  /** Response header name used to echo the resolved request ID back to the caller. */
  responseHeader?: string;
}

/**
 * Express middleware that guarantees `req.requestId` is set to a valid UUID
 * string for every request handled by this server.
 *
 * Resolution order:
 * 1. The first header in `incomingHeaders` whose value is a valid, non-nil UUID
 *    is used as-is.
 * 2. If no candidate matches, a fresh UUIDv4 is generated with
 *    `crypto.randomUUID()`.
 *
 * The resolved value is written to `req.requestId` and echoed back to the
 * caller in the `responseHeader` response header (default: `snyk-request-id`).
 * If synthesis fails (e.g. the crypto subsystem is unavailable), the error is
 * forwarded to Express's error handler and the request is not processed further.
 */
export const setRequestIdHeader = (
  options?: RequestIdHeaderOptions,
): RequestHandler => {
  const incomingHeaders = options?.incomingHeaders ?? DEFAULT_INHERITED_HEADERS;
  const responseHeader = options?.responseHeader ?? DEFAULT_RESPONSE_HEADER;

  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.requestId =
        incomingHeaders.map((h) => req.header(h)).find(isUUID) ?? randomUUID();
      res.setHeader(responseHeader, req.requestId);
    } catch (error) {
      // Should never throw on Node 20+ — a failure here indicates a broken
      // crypto subsystem, so we treat it as fatal and forward to Express's
      // error handler rather than continuing with req.requestId unset.
      logger.error({ error }, 'Failed to set request ID.');
      next(error as Error);
      return;
    }
    next();
  };
};
