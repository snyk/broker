import { log as logger } from '../../../../lib/logs/logger';
import {
  BrokerWorkload,
  BrokerWorkloadOptions,
} from '../../../../lib/broker-workload/websocketRequests';
import { filterRequest } from '../../../../lib/broker-workload/requestFiltering';
import {
  makeRequestToDownstream,
  makeStreamingRequestToDownstream,
} from '../../../../lib/hybrid-sdk/http/request';

const mockSendResponse = jest.fn();
const mockStreamDataResponse = jest.fn();
const mockSendDataResponse = jest.fn();

jest.mock('../../../../lib/logs/logger');
jest.mock('../../../../lib/broker-workload/requestFiltering', () => ({
  filterRequest: jest.fn(),
}));
jest.mock('../../../../lib/hybrid-sdk/responseSenders', () => ({
  HybridResponseHandler: jest.fn().mockImplementation(() => ({
    sendResponse: mockSendResponse,
    streamDataResponse: mockStreamDataResponse,
    sendDataResponse: mockSendDataResponse,
  })),
}));
jest.mock('../../../../lib/hybrid-sdk/http/request', () => ({
  makeRequestToDownstream: jest.fn(),
  makeStreamingRequestToDownstream: jest.fn(),
}));
jest.mock('../../../../lib/broker-workload/prepareRequest', () => ({
  prepareRequest: jest.fn(async () => ({
    req: { url: 'http://downstream.example', headers: {}, method: 'GET' },
  })),
}));
jest.mock(
  '../../../../lib/hybrid-sdk/interpolateRequestWithConfigData',
  () => ({ getInterpolatedRequest: jest.fn(() => ({})) }),
);

const mockFilterRequest = filterRequest as jest.MockedFunction<
  typeof filterRequest
>;
const mockMakeRequest = makeRequestToDownstream as jest.MockedFunction<
  typeof makeRequestToDownstream
>;
const mockMakeStreamingRequest =
  makeStreamingRequestToDownstream as jest.MockedFunction<
    typeof makeStreamingRequestToDownstream
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

  describe('broker error responses', () => {
    const matchedRule: any = { use: {}, valid: [] };

    it('blocked request returns FILTER_BLOCKED with 401', async () => {
      mockFilterRequest.mockReturnValue(null);
      const workload = new BrokerWorkload(
        connectionIdentifier,
        options,
        websocketConnectionHandler,
      );
      const payload = {
        url: '/blocked',
        method: 'GET',
        headers: { 'snyk-request-id': '33333333-3333-4333-8333-333333333333' },
        streamingID: '',
      };

      await workload.handler({ payload, websocketHandler: jest.fn() });

      expect(mockSendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 401,
          errorType: 'FILTER_BLOCKED',
          body: expect.objectContaining({
            code: 'FILTER_BLOCKED',
            message: 'blocked',
            url: '/blocked',
          }),
        }),
      );
    });

    it('non-streaming ECONNREFUSED returns DOWNSTREAM_UNREACHABLE with 502', async () => {
      mockFilterRequest.mockReturnValue(matchedRule);
      mockMakeRequest.mockRejectedValueOnce(
        Object.assign(new Error('connect ECONNREFUSED'), {
          code: 'ECONNREFUSED',
        }),
      );
      const workload = new BrokerWorkload(
        connectionIdentifier,
        options,
        websocketConnectionHandler,
      );
      const payload = {
        url: '/repo',
        method: 'GET',
        headers: { 'snyk-request-id': '44444444-4444-4444-8444-444444444444' },
        streamingID: '',
      };

      await workload.handler({ payload, websocketHandler: jest.fn() });

      expect(mockSendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 502,
          errorType: 'DOWNSTREAM_UNREACHABLE',
          body: expect.objectContaining({ code: 'DOWNSTREAM_UNREACHABLE' }),
        }),
      );
    });

    it('streaming failure before response returns DOWNSTREAM_ERROR with 502', async () => {
      mockFilterRequest.mockReturnValue(matchedRule);
      mockMakeStreamingRequest.mockRejectedValueOnce(new Error('boom'));
      const workload = new BrokerWorkload(
        connectionIdentifier,
        options,
        websocketConnectionHandler,
      );
      const payload = {
        url: '/stream',
        method: 'GET',
        headers: { 'snyk-request-id': '55555555-5555-4555-8555-555555555555' },
        streamingID: 'stream-err',
      };

      await workload.handler({ payload, websocketHandler: jest.fn() });

      expect(mockSendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 502,
          errorType: 'DOWNSTREAM_ERROR',
          body: expect.objectContaining({ code: 'DOWNSTREAM_ERROR' }),
        }),
      );
    });

    it('streaming ETIMEDOUT returns DOWNSTREAM_TIMEOUT with 504', async () => {
      mockFilterRequest.mockReturnValue(matchedRule);
      mockMakeStreamingRequest.mockRejectedValueOnce(
        Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' }),
      );
      const workload = new BrokerWorkload(
        connectionIdentifier,
        options,
        websocketConnectionHandler,
      );
      const payload = {
        url: '/stream',
        method: 'GET',
        headers: { 'snyk-request-id': '66666666-6666-4666-8666-666666666666' },
        streamingID: 'stream-timeout',
      };

      await workload.handler({ payload, websocketHandler: jest.fn() });

      expect(mockSendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 504,
          errorType: 'DOWNSTREAM_TIMEOUT',
          body: expect.objectContaining({ code: 'DOWNSTREAM_TIMEOUT' }),
        }),
      );
    });
  });
});
