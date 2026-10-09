import httpMocks from 'node-mocks-http';

import { BrokerClientRequestWorkload } from '../../../../lib/broker-workload/clientLocalRequests';
import { filterClientRequest } from '../../../../lib/broker-workload/requestFiltering';
import { Rule } from '../../../../lib/hybrid-sdk/common/types/filter';
import { getInterpolatedRequest } from '../../../../lib/hybrid-sdk/interpolateRequestWithConfigData';

const mockMakeRequest = jest.fn();

jest.mock('../../../../lib/hybrid-sdk/clientRequestHelpers', () => ({
  HybridClientRequestHandler: jest.fn().mockImplementation(() => ({
    logContext: {},
    makeRequest: mockMakeRequest,
  })),
}));
jest.mock('../../../../lib/broker-workload/requestFiltering', () => ({
  filterClientRequest: jest.fn(),
}));
jest.mock(
  '../../../../lib/hybrid-sdk/interpolateRequestWithConfigData',
  () => ({
    getInterpolatedRequest: jest.fn(() => ({
      url: 'http://container-registry-agent/api/v2/import/done',
      auth: undefined,
    })),
  }),
);

const mockFilterClientRequest = filterClientRequest as jest.MockedFunction<
  typeof filterClientRequest
>;
const mockGetInterpolatedRequest =
  getInterpolatedRequest as jest.MockedFunction<typeof getInterpolatedRequest>;

describe('BrokerClientRequestWorkload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the selected websocket identifier for request interpolation', async () => {
    const connectionIdentifier = 'selected-connection-identifier';
    const matchedFilterRule: Rule = {
      method: 'POST',
      origin: '${CR_AGENT_URL}',
    };
    const config = {
      brokerType: 'client',
      universalBrokerEnabled: true,
    };
    const req = httpMocks.createRequest({
      method: 'POST',
      url: '/api/v2/import/done',
      headers: {},
    });
    req.requestId = '20202020-2020-4020-8020-202020202020';
    const res = httpMocks.createResponse();
    res.locals.websocket = {
      identifier: connectionIdentifier,
      connectionIdentifier,
    };
    mockFilterClientRequest.mockReturnValue(matchedFilterRule);

    const workload = new BrokerClientRequestWorkload(req, res, { config });
    await workload.handler({ makeRequestOverHttp: false });

    expect(mockGetInterpolatedRequest).toHaveBeenCalledWith(
      connectionIdentifier,
      matchedFilterRule,
      req,
      expect.objectContaining({
        requestId: req.requestId,
      }),
      config,
      'upstream',
    );
    expect(mockMakeRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'http://container-registry-agent/api/v2/import/done',
      }),
      false,
    );
  });
});
