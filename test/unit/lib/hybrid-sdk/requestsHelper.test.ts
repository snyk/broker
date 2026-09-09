/**
 * Tests for `legacyStreaming` (lib/hybrid-sdk/requestsHelper.ts), the
 * capability-fallback streaming path still wired at responseSenders.ts.
 *
 * Pins that the fallback line is logged at INFO (a negotiation outcome),
 * not WARN (a degraded state).
 */

import { log as logger } from '../../../../lib/logs/logger';
import { legacyStreaming } from '../../../../lib/hybrid-sdk/requestsHelper';
import { EventEmitter } from 'node:events';
import { HybridResponseHandler } from '../../../../lib/hybrid-sdk/responseSenders';

jest.mock('../../../../lib/logs/logger');

const logContext: any = { requestId: 'test-request' };

describe('legacyStreaming — capability-fallback log level', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs the capability-fallback line at INFO, not WARN — it is a negotiation outcome, not a degraded state', () => {
    // Chainable stub: every `.on(event, cb)` returns `rqst` so the stream
    // wiring after the log call doesn't blow up.
    const rqst: any = {};
    rqst.on = jest.fn(() => rqst);
    const io: any = { send: jest.fn() };

    legacyStreaming(logContext, rqst, {}, io, 'stream-1');

    expect(logger.info).toHaveBeenCalledWith(
      expect.anything(),
      'Server did not advertise received-post-streams capability - falling back to legacy streaming.',
    );
    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.anything(),
      'Server did not advertise received-post-streams capability - falling back to legacy streaming.',
    );
  });
});

describe('hybrid-sdk/client', () => {
  describe('legacyStreaming', () => {
    describe('response body URL substitution', () => {
      const responseUrl = 'http://private-registry.example/artifactory';
      const replacementUrl =
        'http://internal-broker-server-next/broker/test-broker-token';
      const originalBody = JSON.stringify({
        tarball: `${responseUrl}/pkg.tgz`,
      });
      const transformedBody = JSON.stringify({
        tarball: `${replacementUrl}/pkg.tgz`,
      });

      const relayLegacyStreamingResponse = (
        config,
        contentType = 'application/json',
        body = originalBody,
        contentLengthHeader = 'content-length',
      ) => {
        const response = new EventEmitter() as EventEmitter & {
          statusCode: number;
          headers: Record<string, string>;
        };
        const websocketConnection = { send: jest.fn() };
        const headers = {
          'content-type': contentType,
          [contentLengthHeader]: `${Buffer.byteLength(body)}`,
          'x-downstream-header': 'preserved',
        };
        const handler = new HybridResponseHandler(
          {
            connectionIdentifier: 'test-broker-token',
            payloadStreamingId: 'stream-1',
            requestId: 'request-1',
          } as any,
          websocketConnection as any,
          undefined as any,
          config,
          logContext,
        );

        // With a streaming ID and no receive-post-streams capability this
        // selects the production legacy websocket sender with the already
        // received IncomingMessage shape used by makeStreamingRequestToDownstream.
        response.statusCode = 206;
        response.headers = headers;
        handler.streamDataResponse(response as any);
        response.emit('data', Buffer.from(body));
        response.emit('end');

        return { headers, websocketConnection };
      };

      it('removes stale content length and streams the transformed body', () => {
        const { headers, websocketConnection } = relayLegacyStreamingResponse(
          {
            RES_BODY_URL_SUB: responseUrl,
            BROKER_TOKEN: 'test-broker-token',
          },
          'application/json',
          originalBody,
          'CONTENT-LENGTH',
        );

        expect(websocketConnection.send.mock.calls[0]).toEqual([
          'chunk',
          'stream-1',
          '',
          false,
          {
            status: 206,
            headers: {
              'content-type': 'application/json',
              'snyk-request-id': 'request-1',
              'x-broker-ws-response': 'true',
              'x-downstream-header': 'preserved',
            },
          },
        ]);
        expect(websocketConnection.send.mock.calls[1]).toEqual([
          'chunk',
          'stream-1',
          transformedBody,
          false,
        ]);
        expect(Buffer.byteLength(transformedBody)).not.toBe(
          Buffer.byteLength(originalBody),
        );
        expect(headers['CONTENT-LENGTH']).toBe(
          `${Buffer.byteLength(originalBody)}`,
        );
      });

      it('preserves fixed-length metadata and body without configuration', () => {
        const { headers, websocketConnection } = relayLegacyStreamingResponse(
          {},
        );

        expect(websocketConnection.send.mock.calls[0][4]).toEqual({
          status: 206,
          headers,
        });
        expect(websocketConnection.send.mock.calls[1][2]).toEqual(
          Buffer.from(originalBody),
        );
      });

      it('removes content length before an eligible body with no matching URL', () => {
        const bodyWithoutMatch = JSON.stringify({ message: 'no URL here' });
        const { websocketConnection } = relayLegacyStreamingResponse(
          {
            RES_BODY_URL_SUB: responseUrl,
            BROKER_TOKEN: 'test-broker-token',
          },
          'application/json',
          bodyWithoutMatch,
        );

        expect(
          websocketConnection.send.mock.calls[0][4].headers,
        ).not.toHaveProperty('content-length');
        expect(websocketConnection.send.mock.calls[1][2]).toBe(
          bodyWithoutMatch,
        );
      });

      it('preserves fixed-length metadata and body for a non-JSON response', () => {
        const { headers, websocketConnection } = relayLegacyStreamingResponse(
          {
            RES_BODY_URL_SUB: responseUrl,
            BROKER_TOKEN: 'test-broker-token',
          },
          'text/plain',
        );

        expect(websocketConnection.send.mock.calls[0][4]).toEqual({
          status: 206,
          headers,
        });
        expect(websocketConnection.send.mock.calls[1][2]).toEqual(
          Buffer.from(originalBody),
        );
      });
    });
  });
});
