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
