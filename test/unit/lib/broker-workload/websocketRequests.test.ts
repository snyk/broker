import { log as logger } from '../../../../lib/logs/logger';
import {
  BrokerWorkload,
  BrokerWorkloadOptions,
} from '../../../../lib/broker-workload/websocketRequests';
import { filterRequest } from '../../../../lib/broker-workload/requestFiltering';

jest.mock('../../../../lib/logs/logger');
jest.mock('../../../../lib/broker-workload/requestFiltering', () => ({
  filterRequest: jest.fn(),
}));

const mockFilterRequest = filterRequest as jest.MockedFunction<
  typeof filterRequest
>;

// snyk-request-id is pre-populated in fixtures to reflect production reality:
// forwardWebSocketRequest guarantees the header is a valid UUID before
// BrokerWorkload.handler is ever called.
describe('BrokerWorkload', () => {
  const connectionIdentifier = 'test-connection-id';
  const options: BrokerWorkloadOptions = {
    config: {
      brokerType: 'client',
      universalBrokerEnabled: false,
    },
  };
  const websocketConnectionHandler = {
    friendlyName: 'test-connection',
    socket: { transport: { name: 'test-transport' } },
    send: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFilterRequest.mockReturnValue(null);
  });

  it('includes contextId in logContext when x-snyk-broker-context-id header is set', async () => {
    const workload = new BrokerWorkload(
      connectionIdentifier,
      options,
      websocketConnectionHandler,
    );
    const payload = {
      url: '/',
      method: 'GET',
      headers: {
        'x-snyk-broker-context-id': 'some-uuid',
        'snyk-request-id': '11111111-1111-4111-8111-111111111111',
      },
      streamingID: 'stream-1',
    };
    const websocketHandler = jest.fn();

    await workload.handler({ payload, websocketHandler });

    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        contextId: 'some-uuid',
      }),
      expect.stringContaining('[Websocket Flow] Received request'),
    );
  });

  it('uses payload.requestId in logContext even when headers["snyk-request-id"] differs', async () => {
    const workload = new BrokerWorkload(
      connectionIdentifier,
      options,
      websocketConnectionHandler,
    );
    const payloadRequestId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const headerRequestId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const payload = {
      url: '/',
      method: 'GET',
      headers: { 'snyk-request-id': headerRequestId },
      streamingID: '',
      requestId: payloadRequestId,
    };

    await workload.handler({ payload, websocketHandler: jest.fn() });

    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: payloadRequestId }),
      expect.stringContaining('[Websocket Flow] Received request'),
    );
    expect(logger.debug).not.toHaveBeenCalledWith(
      expect.objectContaining({ requestId: headerRequestId }),
      expect.stringContaining('[Websocket Flow] Received request'),
    );
  });

  it('sets contextId to undefined in logContext when x-snyk-broker-context-id header is absent', async () => {
    const workload = new BrokerWorkload(
      connectionIdentifier,
      options,
      websocketConnectionHandler,
    );
    const payload = {
      url: '/',
      method: 'GET',
      headers: { 'snyk-request-id': '22222222-2222-4222-8222-222222222222' },
      streamingID: 'stream-1',
    };
    const websocketHandler = jest.fn();

    await workload.handler({ payload, websocketHandler });

    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        contextId: undefined,
      }),
      expect.stringContaining('[Websocket Flow] Received request'),
    );
  });
});
