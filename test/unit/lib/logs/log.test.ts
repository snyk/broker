import { log as logger } from '../../../../lib/logs/logger';
import { logResponse } from '../../../../lib/logs/log';

jest.mock('../../../../lib/logs/logger');

describe('logResponse — log level', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs the per-response "Sending response back" line at DEBUG (not INFO)', () => {
    const logContext: any = { requestId: 'test-request' };
    const response: any = { body: 'irrelevant' };

    logResponse(logContext, 200, response, undefined);

    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ responseStatus: 200 }),
      'Sending response back to websocket connection.',
    );
    expect(logger.info).not.toHaveBeenCalledWith(
      expect.anything(),
      'Sending response back to websocket connection.',
    );
  });
});
