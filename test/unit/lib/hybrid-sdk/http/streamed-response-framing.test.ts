import express from 'express';
import http from 'http';
import stream from 'stream';
import { AddressInfo } from 'net';
import { handlePostResponse } from '../../../../../lib/hybrid-sdk/server/routesHandlers/postResponseHandler';
import { streamsStore } from '../../../../../lib/hybrid-sdk/http/server-post-stream-handler';

jest.mock('../../../../../lib/logs/logger', () => ({
  log: {
    info: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../../../../../lib/hybrid-sdk/common/config/config', () => ({
  getConfig: jest.fn(() => ({ BROKER_SERVER_MANDATORY_AUTH_ENABLED: false })),
}));

jest.mock('../../../../../lib/hybrid-sdk/common/utils/metrics', () => ({
  incrementHttpRequestsTotal: jest.fn(),
  observeResponseSize: jest.fn(),
}));

jest.mock('../../../../../lib/hybrid-sdk/server/utils/token', () => ({
  getDesensitizedToken: jest.fn(() => ({
    hashedToken: 'hashed',
    maskedToken: 'masked',
  })),
}));

const frame = (metadata: Record<string, unknown>, body: string): Buffer => {
  const json = Buffer.from(JSON.stringify(metadata), 'utf8');
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32LE(json.length);
  return Buffer.concat([prefix, json, Buffer.from(body, 'utf8')]);
};

// The Broker Client rewrites URLs in the body as it streams when
// RES_BODY_URL_SUB is set, so the relayed body no longer matches the length
// the downstream declared.
const DOWNSTREAM_BODY = '{"tarball":"http://short.example"}';
const REWRITTEN_BODY =
  '{"tarball":"http://internal-broker-server-next/broker/a-much-longer-token"}';

describe('streamed response framing', () => {
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    const app = express();

    // Stands in for clientRequestHelpers.makeWebsocketRequestWithStreamingResponse
    app.get('/relay/:streamingId', (req, res) => {
      const streamBuffer = new stream.PassThrough({ highWaterMark: 1048576 });
      streamsStore.set(req.params.streamingId, {
        response: res,
        streamBuffer,
        streamSize: 0,
        brokerAppClientId: null,
      });
      streamBuffer.pipe(res);
    });

    app.post('/response-data/:brokerToken/:streamingId', handlePostResponse);

    await new Promise<void>((resolve) => {
      server = app.listen(0, resolve);
    });
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  const relay = (
    streamingId: string,
    metadata: Record<string, unknown>,
    body: string,
    method = 'GET',
  ) =>
    new Promise<{
      status?: number;
      headers: http.IncomingHttpHeaders;
      body: string;
    }>((resolve, reject) => {
      const waiting = http.request(
        { port, path: `/relay/${streamingId}`, method },
        (res) => {
          let received = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => (received += chunk));
          res.on('end', () =>
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: received,
            }),
          );
        },
      );
      waiting.on('error', reject);
      waiting.end();

      // Give the GET time to register its stream, then post the response.
      setTimeout(() => {
        const post = http.request(
          {
            port,
            path: `/response-data/a-token/${streamingId}`,
            method: 'POST',
          },
          (res) => res.resume(),
        );
        post.on('error', reject);
        post.end(frame(metadata, body));
      }, 50);
    });

  it('delivers a body that is longer than the downstream Content-Length', async () => {
    const res = await relay(
      'stream-longer-body',
      {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'content-length': `${DOWNSTREAM_BODY.length}`,
        },
      },
      REWRITTEN_BODY,
    );

    expect(res.status).toEqual(200);
    expect(res.body).toEqual(REWRITTEN_BODY);
    expect(res.headers['content-length']).toBeUndefined();
    expect(res.headers['transfer-encoding']).toEqual('chunked');
  });

  it('does not relay connection-scoped headers from the downstream', async () => {
    const res = await relay(
      'stream-hop-by-hop',
      {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'content-length': '5',
          'transfer-encoding': 'chunked',
          connection: 'keep-alive',
          etag: 'abc123',
        },
      },
      REWRITTEN_BODY,
    );

    expect(res.body).toEqual(REWRITTEN_BODY);
    expect(res.headers['etag']).toEqual('abc123');
    expect(res.headers['content-type']).toContain('json');
  });
});
