import { EventEmitter } from 'events';
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
jest.mock(
  '../../../../../../lib/hybrid-sdk/http/server-post-stream-handler',
  () => ({
    StreamResponseHandler: {
      create: jest.fn(() => ({
        writeStatusAndHeaders: mockWriteStatusAndHeaders,
        writeChunk: jest.fn(),
        finished: jest.fn(),
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
