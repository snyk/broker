jest.mock('../../../../lib/hybrid-sdk/client/events', () => ({
  emitError: jest.fn(),
  emitShutdown: jest.fn(),
}));
jest.mock(
  '../../../../lib/hybrid-sdk/http/downstream-post-stream-to-server',
  () => ({
    BrokerServerPostResponseHandler: jest.fn().mockImplementation(() => ({
      sendData: jest.fn(() => {
        throw new Error('send-back failed');
      }),
      forwardRequest: jest.fn(() => {
        throw new Error('send-back failed');
      }),
    })),
  }),
);

import { HybridResponseHandler } from '../../../../lib/hybrid-sdk/responseSenders';
import { emitError } from '../../../../lib/hybrid-sdk/client/events';

describe('HybridResponseHandler.sendDataResponse — downstream relay classification', () => {
  const createHandler = () => {
    const handler = new HybridResponseHandler(
      { connectionIdentifier: 'conn-1' } as any,
      {} as any,
      undefined as any,
      { socketMaxResponseLength: '20971520' } as any,
      {} as any,
    );
    handler.sendResponse = jest.fn();
    return handler;
  };

  it.each([
    [401, 'DOWNSTREAM_UNAUTHORIZED'],
    [403, 'DOWNSTREAM_FORBIDDEN'],
    [429, 'DOWNSTREAM_RATE_LIMITED'],
    [500, 'DOWNSTREAM_SERVER_ERROR'],
    [503, 'DOWNSTREAM_SERVER_ERROR'],
    [400, 'DOWNSTREAM_UNEXPECTED'],
    [422, 'DOWNSTREAM_UNEXPECTED'],
  ])(
    'labels a downstream %d relay with errorType %s, status + body untouched',
    (status, expectedCode) => {
      const handler = createHandler();
      const body = `downstream-${status}-body`;
      const headers = { 'content-type': 'application/json' };

      handler.sendDataResponse({ statusCode: status, body, headers }, {});

      expect(handler.sendResponse).toHaveBeenCalledWith({
        status,
        body,
        headers,
        errorType: expectedCode,
      });
    },
  );

  it.each([200, 204, 301, 404])(
    'does not set errorType for a downstream %d relay',
    (status) => {
      const handler = createHandler();
      const body = `downstream-${status}-body`;
      const headers = { 'content-type': 'application/json' };

      handler.sendDataResponse({ statusCode: status, body, headers }, {});

      expect(handler.sendResponse).toHaveBeenCalledWith({
        status,
        body,
        headers,
      });
      const payload = (handler.sendResponse as jest.Mock).mock.calls[0][0];
      expect(payload).not.toHaveProperty('errorType');
    },
  );
});

describe('HybridResponseHandler — send-back failure emits a joinable client-error', () => {
  beforeEach(() => (emitError as jest.Mock).mockClear());

  it('emits SEND_BACK_FAILED with request id + integration type when the post throws', () => {
    const handler = new HybridResponseHandler(
      { connectionIdentifier: 'conn-1', requestId: 'req-77' } as any,
      { capabilities: ['receive-post-streams'] } as any,
      undefined as any,
      { socketMaxResponseLength: '20971520' } as any,
      { connectionName: 'gitlab' } as any,
    );

    // Post handler throws (mocked); the response path stays silent, so the
    // emitted event is the only trace the server can join on request id.
    handler.sendResponse({ status: 200, body: 'ok' } as any);

    expect(emitError).toHaveBeenCalledWith({
      errorCode: 'SEND_BACK_FAILED',
      requestId: 'req-77',
      integrationType: 'gitlab',
    });
  });
});
