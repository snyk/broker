import { closeHandler } from '../../../../lib/hybrid-sdk/client/socketHandlers/closeHandler';
import { log as logger } from '../../../../lib/logs/logger';
import { WebSocketConnection } from '../../../../lib/hybrid-sdk/client/types/client';
import { LoadedClientOpts } from '../../../../lib/hybrid-sdk/common/types/options';

jest.mock('../../../../lib/logs/logger');

describe('closeHandler', () => {
  let mockWebsocket: WebSocketConnection;
  let mockClientOpts: LoadedClientOpts;

  beforeEach(() => {
    jest.clearAllMocks();
    mockWebsocket = {
      connectionStartTime: undefined,
    } as unknown as WebSocketConnection;
    mockClientOpts = {
      config: {
        brokerServerUrl: 'https://broker.snyk.io',
        brokerToken: 'mock-token',
        universalBrokerEnabled: false,
      },
    } as unknown as LoadedClientOpts;
  });

  it('should log warning with durationMs when connectionStartTime is present', () => {
    const startTime = Date.now() - 5000; // 5 seconds ago
    mockWebsocket.connectionStartTime = startTime;

    // Mock Date.now to return startTime + 5000
    const now = startTime + 5000;
    jest.spyOn(Date, 'now').mockReturnValue(now);

    closeHandler(mockWebsocket, mockClientOpts, {});

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        durationMs: 5000,
        url: 'https://broker.snyk.io',
        token: 'mock-token',
      }),
      'Websocket connection to the broker server was closed.',
    );
  });

  it('should log warning with durationMs -1 when connectionStartTime is undefined', () => {
    closeHandler(mockWebsocket, mockClientOpts, {});

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        durationMs: -1,
        url: 'https://broker.snyk.io',
        token: 'mock-token',
      }),
      'Websocket connection to the broker server was closed.',
    );
  });
});
