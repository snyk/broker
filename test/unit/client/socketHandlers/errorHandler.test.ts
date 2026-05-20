import { log as logger } from '../../../../lib/logs/logger';
import { errorHandler } from '../../../../lib/hybrid-sdk/client/socketHandlers/errorHandler';

describe('errorHandler — log levels (PR 8 contract)', () => {
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('logs "Failed to connect to broker server." at WARN, not ERROR, on TransportError', () => {
    errorHandler({ type: 'TransportError', description: 'connect timed out' });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'TransportError' }),
      'Failed to connect to broker server.',
    );
    expect(errorSpy).not.toHaveBeenCalledWith(
      expect.anything(),
      'Failed to connect to broker server.',
    );
  });
});
