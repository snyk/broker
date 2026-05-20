import { log as logger } from '../../../../lib/logs/logger';
import { HybridClientRequestHandler } from '../../../../lib/hybrid-sdk/clientRequestHelpers';

jest.mock('../../../../lib/logs/logger');
jest.mock('../../../../lib/hybrid-sdk/common/config/config', () => ({
  getConfig: jest.fn(() => ({})),
}));

// Silence the side-effecting transitive imports (NodeCache init + axios) —
// they have nothing to do with the log-level under test.
jest.mock('../../../../lib/hybrid-sdk/http/server-post-stream-handler', () => ({
  streamsStore: { set: jest.fn(), get: jest.fn(), del: jest.fn() },
}));
jest.mock('../../../../lib/hybrid-sdk/http/request', () => ({
  makeRequestToDownstream: jest.fn(),
}));

describe('HybridClientRequestHandler — [HTTP Flow] Received request log level', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs the per-request "Received request" line at DEBUG (not INFO)', () => {
    const req: any = {
      url: '/some/path',
      method: 'GET',
      headers: {},
    };
    const res: any = {};

    new HybridClientRequestHandler(req, res);

    expect(logger.debug).toHaveBeenCalledWith(
      expect.any(Object),
      '[HTTP Flow] Received request.',
    );
    expect(logger.info).not.toHaveBeenCalledWith(
      expect.anything(),
      '[HTTP Flow] Received request.',
    );
  });
});

describe('HybridClientRequestHandler — req.requestId propagation into req.headers', () => {
  const RESOLVED_UUID = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('overwrites snyk-request-id header with req.requestId even when the inbound header was already populated with junk', () => {
    // This pins the contract: the middleware-resolved req.requestId is
    // authoritative. The inbound header may have carried junk that the
    // middleware chose not to use (because it failed isUUID); we must not
    // forward that junk into the WS payload.
    const req: any = {
      url: '/some/path',
      method: 'GET',
      headers: { 'snyk-request-id': 'not-a-uuid' },
      requestId: RESOLVED_UUID,
    };
    const res: any = {};

    new HybridClientRequestHandler(req, res);

    expect(req.headers['snyk-request-id']).toBe(RESOLVED_UUID);
  });

  it('writes req.requestId into snyk-request-id header when no inbound header was present', () => {
    const req: any = {
      url: '/some/path',
      method: 'GET',
      headers: {},
      requestId: RESOLVED_UUID,
    };
    const res: any = {};

    new HybridClientRequestHandler(req, res);

    expect(req.headers['snyk-request-id']).toBe(RESOLVED_UUID);
  });
});
