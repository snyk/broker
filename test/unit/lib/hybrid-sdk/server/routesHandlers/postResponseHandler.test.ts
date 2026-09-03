import { EventEmitter } from 'events';
import express from 'express';
import http from 'http';
import { AddressInfo } from 'net';
import { log } from '../../../../../../lib/logs/logger';
import { handlePostResponse } from '../../../../../../lib/hybrid-sdk/server/routesHandlers/postResponseHandler';

jest.mock('../../../../../../lib/logs/logger', () => ({
  log: {
    info: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockWriteStatusAndHeaders = jest.fn();
const mockWriteChunk = jest.fn();
const mockFinished = jest.fn();
jest.mock(
  '../../../../../../lib/hybrid-sdk/http/server-post-stream-handler',
  () => ({
    StreamResponseHandler: {
      create: jest.fn(() => ({
        writeStatusAndHeaders: mockWriteStatusAndHeaders,
        writeChunk: mockWriteChunk,
        finished: mockFinished,
        destroy: jest.fn(),
        streamResponse: {},
      })),
    },
  }),
);

jest.mock('../../../../../../lib/hybrid-sdk/common/config/config', () => ({
  getConfig: jest.fn(() => ({ BROKER_SERVER_MANDATORY_AUTH_ENABLED: false })),
}));

jest.mock('../../../../../../lib/hybrid-sdk/common/utils/metrics', () => ({
  incrementHttpRequestsTotal: jest.fn(),
}));

jest.mock('../../../../../../lib/hybrid-sdk/server/utils/token', () => ({
  getDesensitizedToken: jest.fn(() => ({
    hashedToken: 'hashed',
    maskedToken: 'masked',
  })),
}));

const frameIoData = (obj: Record<string, unknown>): Buffer => {
  const json = JSON.stringify(obj);
  const length = Buffer.byteLength(json, 'utf8');
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32LE(length);
  return Buffer.concat([prefix, Buffer.from(json, 'utf8')]);
};

const validResponseFrame = () => {
  const metadata = Buffer.from(
    JSON.stringify({
      status: 200,
      headers: { 'content-type': 'text/plain' },
    }),
    'utf8',
  );
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32LE(metadata.length);
  return { prefix, metadata, body: Buffer.from('valid response body') };
};

const createReqRes = () => {
  const req = new EventEmitter() as any;
  req.params = { brokerToken: 'token', streamingId: 'stream-1' };
  req.headers = {};
  req.requestId = 'req-1';
  req.pause = jest.fn();
  req.resume = jest.fn();
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as any;
  return { req, res };
};

describe('handlePostResponse — errorType logging', () => {
  beforeEach(() => jest.clearAllMocks());

  it('logs errorType at info level when an error code accompanies a >299 status', () => {
    const { req, res } = createReqRes();
    handlePostResponse(req, res);

    req.emit(
      'data',
      frameIoData({
        status: 401,
        errorType: 'FILTER_BLOCKED',
        headers: {},
      }),
    );
    req.emit('end');

    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({
        responseStatus: 401,
        errorType: 'FILTER_BLOCKED',
      }),
      'Handling response-data request - io bits',
    );
    expect(mockWriteStatusAndHeaders).toHaveBeenCalledWith(
      expect.objectContaining({ status: 401, errorType: 'FILTER_BLOCKED' }),
    );
  });

  it('carries a synthesized DOWNSTREAM_UNREACHABLE code on a 502', () => {
    const { req, res } = createReqRes();
    handlePostResponse(req, res);

    req.emit(
      'data',
      frameIoData({
        status: 502,
        errorType: 'DOWNSTREAM_UNREACHABLE',
        headers: {},
      }),
    );
    req.emit('end');

    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({
        responseStatus: 502,
        errorType: 'DOWNSTREAM_UNREACHABLE',
      }),
      'Handling response-data request - io bits',
    );
  });

  it.each([
    [401, 'DOWNSTREAM_UNAUTHORIZED'],
    [429, 'DOWNSTREAM_RATE_LIMITED'],
    [503, 'DOWNSTREAM_SERVER_ERROR'],
  ])(
    'logs a pass-through code on a downstream %d, status unchanged',
    (status, errorType) => {
      const { req, res } = createReqRes();
      handlePostResponse(req, res);

      req.emit('data', frameIoData({ status, errorType, headers: {} }));
      req.emit('end');

      expect(log.info).toHaveBeenCalledWith(
        expect.objectContaining({ responseStatus: status, errorType }),
        'Handling response-data request - io bits',
      );
      expect(mockWriteStatusAndHeaders).toHaveBeenCalledWith(
        expect.objectContaining({ status, errorType }),
      );
    },
  );

  it('leaves errorType undefined for a normal 2xx response (debug branch)', () => {
    const { req, res } = createReqRes();
    handlePostResponse(req, res);

    req.emit('data', frameIoData({ status: 200, headers: {} }));
    req.emit('end');

    expect(log.info).not.toHaveBeenCalledWith(
      expect.anything(),
      'Handling response-data request - io bits',
    );
    expect(log.debug).toHaveBeenCalledWith(
      expect.objectContaining({ responseStatus: 200, errorType: undefined }),
      'Handling response-data request - io bits',
    );
  });
});

describe('handlePostResponse — four-byte prefix fragmentation evidence', () => {
  beforeEach(() => jest.clearAllMocks());

  const driveFrame = (prefixFragmentSizes: number[]) => {
    const { req, res } = createReqRes();
    const { prefix, metadata, body } = validResponseFrame();
    handlePostResponse(req, res);

    let offset = 0;
    for (const size of prefixFragmentSizes) {
      req.emit('data', prefix.subarray(offset, offset + size));
      offset += size;
    }
    expect(offset).toBe(prefix.length);
    req.emit('data', metadata);
    req.emit('data', body);
    req.emit('end');

    return { res, metadata, body };
  };

  it('accepts a valid frame when all four prefix bytes are in one data event', () => {
    const { res, body } = driveFrame([4]);

    expect(log.error).not.toHaveBeenCalledWith(
      expect.anything(),
      'Caught error handling data event for streaming HTTP response.',
    );
    expect(mockWriteStatusAndHeaders).toHaveBeenCalledWith({
      status: 200,
      headers: { 'content-type': 'text/plain' },
    });
    expect(mockWriteChunk).toHaveBeenCalledWith(body, expect.any(Function));
    expect(mockFinished).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it.each([
    ['1+3', [1, 3]],
    ['2+2', [2, 2]],
    ['3+1', [3, 1]],
    ['1+1+1+1', [1, 1, 1, 1]],
    ['1+1+2', [1, 1, 2]],
    ['1+2+1', [1, 2, 1]],
    ['2+1+1', [2, 1, 1]],
  ])(
    'accepts a valid frame for %s prefix delivery',
    (_label, fragmentSizes) => {
      const { res, body } = driveFrame(fragmentSizes as number[]);

      expect(log.error).not.toHaveBeenCalled();
      expect(mockWriteStatusAndHeaders).toHaveBeenCalledWith({
        status: 200,
        headers: { 'content-type': 'text/plain' },
      });
      expect(mockWriteChunk).toHaveBeenCalledWith(body, expect.any(Function));
      expect(mockFinished).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({});
    },
  );

  it('reads the declared metadata size after a fragmented prefix', () => {
    const { metadata } = driveFrame([1, 3]);

    expect(log.debug).toHaveBeenCalledWith(
      expect.objectContaining({ statusAndHeadersSize: metadata.length }),
      'Request metadata size read from stream.',
    );
    expect(mockWriteStatusAndHeaders).toHaveBeenCalledWith({
      status: 200,
      headers: { 'content-type': 'text/plain' },
    });
  });

  it.each([1, 2, 3])(
    'logs an incomplete metadata-length prefix when the request ends after %d byte(s)',
    (receivedPrefixBytes) => {
      const { req, res } = createReqRes();
      const { prefix } = validResponseFrame();
      handlePostResponse(req, res);

      req.emit('data', prefix.subarray(0, receivedPrefixBytes));
      req.emit('end');

      const framingErrors = (log.error as jest.Mock).mock.calls.filter(
        ([, message]) =>
          message ===
          'Incomplete metadata-length prefix at end of streaming HTTP response.',
      );
      expect(log.error).toHaveBeenCalledTimes(1);
      expect(framingErrors).toHaveLength(1);
      expect(framingErrors[0][0]).toMatchObject({
        hashedToken: 'hashed',
        maskedToken: 'masked',
        streamingID: 'stream-1',
        requestId: 'req-1',
        receivedPrefixBytes,
        expectedPrefixBytes: 4,
        error: {
          message: `Incomplete metadata-length prefix: received ${receivedPrefixBytes} of 4 bytes.`,
        },
      });
      expect(mockWriteStatusAndHeaders).not.toHaveBeenCalled();
      expect(mockWriteChunk).not.toHaveBeenCalled();
      expect(mockFinished).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({});
    },
  );

  it('does not classify a zero-byte request as a truncated prefix', () => {
    const { req, res } = createReqRes();
    handlePostResponse(req, res);

    req.emit('end');

    expect(log.error).not.toHaveBeenCalled();
    expect(mockWriteStatusAndHeaders).not.toHaveBeenCalled();
    expect(mockWriteChunk).not.toHaveBeenCalled();
    expect(mockFinished).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({});
  });

  it('parses a complete prefix, metadata, and body from one data event', () => {
    const { req, res } = createReqRes();
    const { prefix, metadata, body } = validResponseFrame();
    handlePostResponse(req, res);

    req.emit('data', Buffer.concat([prefix, metadata, body]));
    req.emit('end');

    expect(log.error).not.toHaveBeenCalled();
    expect(mockWriteStatusAndHeaders).toHaveBeenCalledWith({
      status: 200,
      headers: { 'content-type': 'text/plain' },
    });
    expect(mockWriteChunk).toHaveBeenCalledTimes(1);
    expect(mockWriteChunk).toHaveBeenCalledWith(body, expect.any(Function));
    expect(mockFinished).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({});
  });

  it('parses metadata fragmented inside a multibyte UTF-8 value', () => {
    const { req, res } = createReqRes();
    const headers = {
      'content-type': 'text/plain; charset=utf-8',
      'x-response-label': '日本語',
    };
    const metadata = Buffer.from(JSON.stringify({ status: 206, headers }));
    const prefix = Buffer.alloc(4);
    prefix.writeUInt32LE(metadata.length);
    const body = Buffer.from('exact UTF-8 response body');
    const multibyteValue = Buffer.from('日');
    const codePointStart = metadata.indexOf(multibyteValue);
    expect(codePointStart).toBeGreaterThan(-1);
    const splitPosition = codePointStart + 1;
    handlePostResponse(req, res);

    req.emit(
      'data',
      Buffer.concat([prefix, metadata.subarray(0, splitPosition)]),
    );
    req.emit('data', Buffer.concat([metadata.subarray(splitPosition), body]));
    req.emit('end');

    expect(log.error).not.toHaveBeenCalled();
    expect(mockWriteStatusAndHeaders).toHaveBeenCalledWith({
      status: 206,
      headers,
    });
    const forwardedBody = Buffer.concat(
      mockWriteChunk.mock.calls.map(([chunk]) => chunk),
    );
    expect(forwardedBody).toEqual(body);
    expect(mockFinished).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({});
  });

  it('continues into metadata when the prefix-completing event contains both', () => {
    const { req, res } = createReqRes();
    const { prefix, metadata, body } = validResponseFrame();
    handlePostResponse(req, res);

    req.emit('data', prefix.subarray(0, 2));
    req.emit(
      'data',
      Buffer.concat([prefix.subarray(2), metadata.subarray(0, 7)]),
    );
    req.emit('data', metadata.subarray(7));
    req.emit('data', body);
    req.emit('end');

    expect(log.error).not.toHaveBeenCalledWith(
      expect.anything(),
      'Caught error handling data event for streaming HTTP response.',
    );
    expect(mockWriteStatusAndHeaders).toHaveBeenCalledWith({
      status: 200,
      headers: { 'content-type': 'text/plain' },
    });
    expect(mockWriteChunk).toHaveBeenCalledWith(body, expect.any(Function));
    expect(mockFinished).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('forwards body bytes from the event that completes metadata', () => {
    const { req, res } = createReqRes();
    const { prefix, metadata, body } = validResponseFrame();
    const metadataTailLength = 3;
    const firstBodyLength = 5;
    handlePostResponse(req, res);

    req.emit(
      'data',
      Buffer.concat([
        prefix,
        metadata.subarray(0, metadata.length - metadataTailLength),
      ]),
    );
    req.emit(
      'data',
      Buffer.concat([
        metadata.subarray(metadata.length - metadataTailLength),
        body.subarray(0, firstBodyLength),
      ]),
    );
    req.emit('data', body.subarray(firstBodyLength));
    req.emit('end');

    expect(log.error).not.toHaveBeenCalledWith(
      expect.anything(),
      'Caught error handling data event for streaming HTTP response.',
    );
    expect(mockWriteStatusAndHeaders).toHaveBeenCalledWith({
      status: 200,
      headers: { 'content-type': 'text/plain' },
    });
    const forwardedBody = Buffer.concat(
      mockWriteChunk.mock.calls.map(([chunk]) => chunk),
    );
    expect(forwardedBody).toEqual(body);
    expect(mockWriteChunk.mock.calls[0][0]).toEqual(
      body.subarray(0, firstBodyLength),
    );
    expect(mockFinished).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('reproduces 1+3 prefix delivery through a real chunked HTTP request', async () => {
    const app = express();
    let transferEncoding: string | undefined;
    app.use((req, _res, next) => {
      transferEncoding = req.headers['transfer-encoding'];
      next();
    });
    app.post('/response-data/:brokerToken/:streamingId', handlePostResponse);
    const server = http.createServer(app);
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });

    try {
      const { port } = server.address() as AddressInfo;
      const { prefix, metadata, body } = validResponseFrame();
      const responseStatus = new Promise<number | undefined>(
        (resolve, reject) => {
          const request = http.request(
            {
              host: '127.0.0.1',
              port,
              method: 'POST',
              path: '/response-data/token/stream-1',
              headers: {
                'content-type': 'application/vnd.broker.stream+octet-stream',
              },
            },
            (response) => {
              response.resume();
              response.on('end', () => resolve(response.statusCode));
            },
          );
          request.on('error', reject);
          request.write(prefix.subarray(0, 1));
          request.write(prefix.subarray(1));
          request.write(metadata);
          request.end(body);
        },
      );

      await expect(responseStatus).resolves.toBe(200);
      expect(transferEncoding).toBe('chunked');

      const receivedLengths = (log.trace as jest.Mock).mock.calls
        .filter(([, message]) => message === 'Received data event.')
        .map(([context]) => context.dataLength);
      expect(receivedLengths).toEqual([1, 3, metadata.length, body.length]);
      expect(log.error).not.toHaveBeenCalled();
      expect(mockWriteStatusAndHeaders).toHaveBeenCalledWith({
        status: 200,
        headers: { 'content-type': 'text/plain' },
      });
      const forwardedBody = Buffer.concat(
        mockWriteChunk.mock.calls.map(([chunk]) => chunk),
      );
      expect(forwardedBody).toEqual(body);
      expect(mockFinished).toHaveBeenCalledTimes(1);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
