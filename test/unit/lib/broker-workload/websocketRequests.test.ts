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
      headers: { 'x-snyk-broker-context-id': 'some-uuid' },
      streamingID: 'stream-1',
    };
    const websocketHandler = jest.fn();

    await workload.handler({ payload, websocketHandler });

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        contextId: 'some-uuid',
      }),
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
      headers: {},
      streamingID: 'stream-1',
    };
    const websocketHandler = jest.fn();

    await workload.handler({ payload, websocketHandler });

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        contextId: undefined,
      }),
      expect.stringContaining('[Websocket Flow] Received request'),
    );
  });
});
