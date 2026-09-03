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
    ['2+1+1', [2, 1, 1]],
  ])(
    'logs ERR_BUFFER_OUT_OF_BOUNDS and loses a valid frame for %s prefix delivery',
    (_label, fragmentSizes) => {
      const { res } = driveFrame(fragmentSizes as number[]);
      const parserErrors = (log.error as jest.Mock).mock.calls.filter(
        ([, message]) =>
          message ===
          'Caught error handling data event for streaming HTTP response.',
      );

      expect(parserErrors).toHaveLength(fragmentSizes.length);
      for (const [context] of parserErrors) {
        expect(context).toMatchObject({
          statusAndHeaders: '',
          statusAndHeadersSize: -1,
          error: { code: 'ERR_BUFFER_OUT_OF_BOUNDS' },
        });
        expect(context.error.name).toBe('RangeError');
        expect(context.error.message).toBe(
          'Attempt to access memory outside buffer bounds',
        );
      }
      expect(mockWriteStatusAndHeaders).not.toHaveBeenCalled();
      expect(mockWriteChunk).not.toHaveBeenCalled();

      // The data-event exception is swallowed. The normal end handler still
      // closes the caller's body stream and acknowledges the POST.
      expect(mockFinished).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({});
    },
  );

  it('reinterprets the next four metadata bytes as a replacement prefix', () => {
    const { metadata } = driveFrame([1, 3]);
    const replacementSize = metadata.readUInt32LE(0);

    expect(log.debug).toHaveBeenCalledWith(
      expect.objectContaining({ statusAndHeadersSize: replacementSize }),
      'Request metadata size read from stream.',
    );
    expect(replacementSize).not.toBe(metadata.length);
    expect(mockWriteStatusAndHeaders).not.toHaveBeenCalled();
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
      const parserErrors = (log.error as jest.Mock).mock.calls.filter(
        ([, message]) =>
          message ===
          'Caught error handling data event for streaming HTTP response.',
      );
      expect(parserErrors).toHaveLength(2);
      expect(parserErrors[0][0]).toMatchObject({
        statusAndHeaders: '',
        statusAndHeadersSize: -1,
        error: { code: 'ERR_BUFFER_OUT_OF_BOUNDS' },
      });
      expect(mockWriteStatusAndHeaders).not.toHaveBeenCalled();
      expect(mockWriteChunk).not.toHaveBeenCalled();
      expect(mockFinished).toHaveBeenCalledTimes(1);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
