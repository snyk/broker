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

describe('hybrid-sdk/client', () => {
  describe('HybridResponseHandler', () => {
    describe('buffered websocket response body URL substitution', () => {
      const responseUrl = 'http://private-registry.example/artifactory';
      const replacementUrl =
        'http://internal-broker-server-next/broker/test-broker-token';
      const originalBody = JSON.stringify({
        tarball: `${responseUrl}/pkg.tgz`,
        location: 'München',
      });
      const transformedBody = JSON.stringify({
        tarball: `${replacementUrl}/pkg.tgz`,
        location: 'München',
      });

      const sendBufferedResponse = (
        config,
        contentType = 'application/json',
        body = originalBody,
        contentLengthHeader = 'content-length',
        additionalHeaders = {},
      ) => {
        const websocketResponseHandler = jest.fn();
        const handler = new HybridResponseHandler(
          {
            connectionIdentifier: 'test-broker-token',
            requestId: 'request-1',
          } as any,
          {} as any,
          websocketResponseHandler,
          { socketMaxResponseLength: '20971520', ...config } as any,
          {} as any,
        );
        const headers = {
          'content-type': contentType,
          [contentLengthHeader]: `${Buffer.byteLength(body, 'utf8')}`,
          'x-downstream-header': 'preserved',
          ...additionalHeaders,
        };

        handler.sendDataResponse({ statusCode: 201, body, headers }, {});

        return { headers, websocketResponseHandler };
      };

      it('recomputes content length from the complete transformed body', () => {
        const { headers, websocketResponseHandler } = sendBufferedResponse(
          {
            RES_BODY_URL_SUB: responseUrl,
            BROKER_TOKEN: 'test-broker-token',
          },
          'application/json',
          originalBody,
          'Content-Length',
        );

        expect(websocketResponseHandler).toHaveBeenCalledWith({
          status: 201,
          body: transformedBody,
          headers: {
            'content-type': 'application/json',
            'content-length': `${Buffer.byteLength(transformedBody, 'utf8')}`,
            'x-downstream-header': 'preserved',
            'snyk-request-id': 'request-1',
            'x-broker-ws-response': 'true',
          },
        });
        expect(Buffer.byteLength(transformedBody, 'utf8')).not.toBe(
          Buffer.byteLength(originalBody, 'utf8'),
        );
        expect(headers['Content-Length']).toBe(
          `${Buffer.byteLength(originalBody, 'utf8')}`,
        );
        expect(headers).not.toHaveProperty('snyk-request-id');
      });

      it('collapses differently cased source lengths into one transformed byte length', () => {
        const { headers, websocketResponseHandler } = sendBufferedResponse(
          {
            RES_BODY_URL_SUB: responseUrl,
            BROKER_TOKEN: 'test-broker-token',
          },
          'application/json',
          originalBody,
          'Content-Length',
          {
            'content-length': `${Buffer.byteLength(originalBody, 'utf8')}`,
            'CONTENT-LENGTH': `${Buffer.byteLength(originalBody, 'utf8')}`,
          },
        );

        const relayed = websocketResponseHandler.mock.calls[0][0];
        expect(relayed.headers).toEqual({
          'content-type': 'application/json',
          'content-length': `${Buffer.byteLength(transformedBody, 'utf8')}`,
          'x-downstream-header': 'preserved',
          'snyk-request-id': 'request-1',
          'x-broker-ws-response': 'true',
        });
        expect(headers).toEqual({
          'content-type': 'application/json',
          'Content-Length': `${Buffer.byteLength(originalBody, 'utf8')}`,
          'content-length': `${Buffer.byteLength(originalBody, 'utf8')}`,
          'CONTENT-LENGTH': `${Buffer.byteLength(originalBody, 'utf8')}`,
          'x-downstream-header': 'preserved',
        });
      });

      it('preserves fixed-length metadata and body without configuration', () => {
        const { websocketResponseHandler } = sendBufferedResponse({});

        expect(websocketResponseHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            body: originalBody,
            headers: expect.objectContaining({
              'content-length': `${Buffer.byteLength(originalBody, 'utf8')}`,
              'x-downstream-header': 'preserved',
            }),
          }),
        );
      });

      it('preserves fixed-length metadata and body for a non-JSON response', () => {
        const { websocketResponseHandler } = sendBufferedResponse(
          {
            RES_BODY_URL_SUB: responseUrl,
            BROKER_TOKEN: 'test-broker-token',
          },
          'text/plain',
        );

        expect(websocketResponseHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            body: originalBody,
            headers: expect.objectContaining({
              'content-length': `${Buffer.byteLength(originalBody, 'utf8')}`,
              'x-downstream-header': 'preserved',
            }),
          }),
        );
      });

      it('retains the exact length for an eligible body with no matching URL', () => {
        const bodyWithoutMatch = JSON.stringify({
          message: 'no URL here',
          location: 'München',
        });
        const { websocketResponseHandler } = sendBufferedResponse(
          {
            RES_BODY_URL_SUB: responseUrl,
            BROKER_TOKEN: 'test-broker-token',
          },
          'application/json',
          bodyWithoutMatch,
        );

        expect(websocketResponseHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            body: bodyWithoutMatch,
            headers: expect.objectContaining({
              'content-length': `${Buffer.byteLength(
                bodyWithoutMatch,
                'utf8',
              )}`,
            }),
          }),
        );
      });

      it('keeps content length absent when transformed metadata had no fixed length', () => {
        const websocketResponseHandler = jest.fn();
        const handler = new HybridResponseHandler(
          {
            connectionIdentifier: 'test-broker-token',
            requestId: 'request-1',
          } as any,
          {} as any,
          websocketResponseHandler,
          {
            socketMaxResponseLength: '20971520',
            RES_BODY_URL_SUB: responseUrl,
            BROKER_TOKEN: 'test-broker-token',
          } as any,
          {} as any,
        );

        handler.sendDataResponse(
          {
            statusCode: 201,
            body: originalBody,
            headers: {
              'content-type': 'application/json',
              'transfer-encoding': 'chunked',
            },
          },
          {},
        );

        const relayed = websocketResponseHandler.mock.calls[0][0];
        expect(relayed.body).toBe(transformedBody);
        expect(relayed.headers).not.toHaveProperty('content-length');
        expect(relayed.headers['transfer-encoding']).toBe('chunked');
      });
    });
  });
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
