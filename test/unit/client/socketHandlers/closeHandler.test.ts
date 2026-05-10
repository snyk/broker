import { reportWebSocketClosureEvent } from '../../../../lib/hybrid-sdk/client/socketHandlers/reportWebSocketClosureEvent';
import { log as logger } from '../../../../lib/logs/logger';
import { WebSocketConnection } from '../../../../lib/hybrid-sdk/client/types/client';
import { LoadedClientOpts } from '../../../../lib/hybrid-sdk/common/types/options';
import { NoopClient } from '../../../../lib/hybrid-sdk/client/metrics';

jest.mock('../../../../lib/logs/logger');

describe('closeHandler', () => {
  let mockWebsocket: WebSocketConnection;
  let mockClientOpts: LoadedClientOpts;
  let metricsClient: NoopClient;

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
    metricsClient = new NoopClient();
  });

  it('should log warning with durationMs when connectionStartTime is present', () => {
    const startTime = Date.now() - 5000;
    mockWebsocket.connectionStartTime = startTime;

    const now = startTime + 5000;
    jest.spyOn(Date, 'now').mockReturnValue(now);

    reportWebSocketClosureEvent(mockWebsocket, mockClientOpts, {}, metricsClient, 'connection_lost');

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        durationMs: 5000,
        url: 'https://broker.snyk.io',
        token: 'mock-token',
        reason: 'connection_lost',
      }),
      'Websocket connection event: connection_lost',
    );
  });

  it('should log warning with durationMs -1 when connectionStartTime is undefined', () => {
    reportWebSocketClosureEvent(mockWebsocket, mockClientOpts, {}, metricsClient, 'connection_lost');

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        durationMs: -1,
        url: 'https://broker.snyk.io',
        token: 'mock-token',
        reason: 'connection_lost',
      }),
      'Websocket connection event: connection_lost',
    );
  });

  it('should include reason in log for each termination event type', () => {
    const reasons = [
      'connection_lost',
      'connection_ended',
      'connection_destroyed',
      'connection_timed_out',
      'server_requested_close',
    ];

    for (const reason of reasons) {
      jest.clearAllMocks();
      reportWebSocketClosureEvent(mockWebsocket, mockClientOpts, {}, metricsClient, reason);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ reason }),
        `Websocket connection event: ${reason}`,
      );
    }
  });

  it('should record lifecycle metric with the given reason', () => {
    const spy = jest.spyOn(metricsClient, 'recordWebsocketLifecycleEvent');
    reportWebSocketClosureEvent(
      mockWebsocket,
      mockClientOpts,
      { role: 'primary' },
      metricsClient,
      'connection_timed_out',
    );

    expect(spy).toHaveBeenCalledWith('connection_timed_out', 'primary');
  });

  it('should record connection duration when connectionStartTime is set', () => {
    const spy = jest.spyOn(metricsClient, 'recordConnectionDuration');
    mockWebsocket.connectionStartTime = Date.now() - 10000;
    jest.spyOn(Date, 'now').mockReturnValue(mockWebsocket.connectionStartTime + 10000);

    reportWebSocketClosureEvent(
      mockWebsocket,
      mockClientOpts,
      { role: 'secondary' },
      metricsClient,
      'connection_ended',
    );

    expect(spy).toHaveBeenCalledWith('secondary', 10);
  });

  it('should not record connection duration when connectionStartTime is undefined', () => {
    const spy = jest.spyOn(metricsClient, 'recordConnectionDuration');
    reportWebSocketClosureEvent(
      mockWebsocket,
      mockClientOpts,
      { role: 'primary' },
      metricsClient,
      'connection_destroyed',
    );

    expect(spy).not.toHaveBeenCalled();
  });
});
