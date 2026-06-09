import { HybridResponseHandler } from '../../../../lib/hybrid-sdk/responseSenders';

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
