import { EventEmitter } from 'events';
import { log as logger } from '../../../../lib/logs/logger';
import { makeRequestToDownstream } from '../../../../lib/hybrid-sdk/http/request';
import { HybridClientRequestHandler } from '../../../../lib/hybrid-sdk/clientRequestHelpers';

jest.mock('../../../../lib/logs/logger');
jest.mock('../../../../lib/hybrid-sdk/common/config/config', () => ({
  getConfig: jest.fn(() => ({})),
}));

// Silence the side-effecting transitive imports (NodeCache init + axios) —
// they have nothing to do with the log-level under test.
jest.mock('../../../../lib/hybrid-sdk/http/server-post-stream-handler', () => ({
  streamsStore: { set: jest.fn(), get: jest.fn(), del: jest.fn() },
}));
jest.mock('../../../../lib/hybrid-sdk/http/request', () => ({
  makeRequestToDownstream: jest.fn(),
}));

describe('HybridClientRequestHandler — [HTTP Flow] Received request log level', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs the per-request "Received request" line at DEBUG (not INFO)', () => {
    const req: any = {
      url: '/some/path',
      method: 'GET',
      headers: {},
    };
    const res: any = {};

    new HybridClientRequestHandler(req, res);

    expect(logger.debug).toHaveBeenCalledWith(
      expect.any(Object),
      '[HTTP Flow] Received request.',
    );
    expect(logger.info).not.toHaveBeenCalledWith(
      expect.anything(),
      '[HTTP Flow] Received request.',
    );
  });
});

describe('HybridClientRequestHandler — req.requestId propagation into req.headers', () => {
  const RESOLVED_UUID = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('overwrites snyk-request-id header with req.requestId even when the inbound header was already populated with junk', () => {
    // This pins the contract: the middleware-resolved req.requestId is
    // authoritative. The inbound header may have carried junk that the
    // middleware chose not to use (because it failed isUUID); we must not
    // forward that junk into the WS payload.
    const req: any = {
      url: '/some/path',
      method: 'GET',
      headers: { 'snyk-request-id': 'not-a-uuid' },
      requestId: RESOLVED_UUID,
    };
    const res: any = {};

    new HybridClientRequestHandler(req, res);

    expect(req.headers['snyk-request-id']).toBe(RESOLVED_UUID);
  });

  it('writes req.requestId into snyk-request-id header when no inbound header was present', () => {
    const req: any = {
      url: '/some/path',
      method: 'GET',
      headers: {},
      requestId: RESOLVED_UUID,
    };
    const res: any = {};

    new HybridClientRequestHandler(req, res);

    expect(req.headers['snyk-request-id']).toBe(RESOLVED_UUID);
  });
});

describe('HybridClientRequestHandler — makeHttpRequest() snyk-request-id response echo', () => {
  const BROKER_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const SNYK_API_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  const makeMockRes = () => {
    const res: any = {
      locals: { websocket: { identifier: 'test-identifier' } },
      set: jest.fn(),
      status: jest.fn(),
      send: jest.fn(),
    };
    res.status.mockReturnValue(res);
    res.set.mockReturnValue(res);
    res.send.mockReturnValue(res);
    return res;
  };

  const makeMockReq = (extra: Record<string, unknown> = {}) => ({
    url: '/webhook/github/aaaa',
    method: 'POST',
    body: '{}',
    headers: { 'snyk-request-id': BROKER_UUID },
    requestId: BROKER_UUID,
    maskedToken: '',
    hashedToken: '',
    ...extra,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (
      require('../../../../lib/hybrid-sdk/common/config/config')
        .getConfig as jest.Mock
    ).mockReturnValue({
      API_BASE_URL: 'http://snyk-api.example.com',
    });
  });

  it('sends snyk-request-id in outbound request headers to Snyk API', async () => {
    (makeRequestToDownstream as jest.Mock).mockResolvedValue({
      statusCode: 200,
      headers: {},
      body: '{}',
    });

    const req: any = makeMockReq();
    const res: any = makeMockRes();
    const handler = new HybridClientRequestHandler(req, res);
    handler.makeRequest({ url: '/webhook/github/aaaa' } as any, true);

    await new Promise((r) => setImmediate(r));

    expect(makeRequestToDownstream).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({ 'snyk-request-id': BROKER_UUID }),
      }),
    );
  });

  it('echoes broker UUID even when Snyk API response carries a different snyk-request-id', async () => {
    (makeRequestToDownstream as jest.Mock).mockResolvedValue({
      statusCode: 200,
      headers: {
        'snyk-request-id': SNYK_API_UUID,
        'content-type': 'application/json',
      },
      body: '{}',
    });

    const req: any = makeMockReq();
    const res: any = makeMockRes();
    const handler = new HybridClientRequestHandler(req, res);
    handler.makeRequest({ url: '/webhook/github/aaaa' } as any, true);

    // Allow the promise chain to settle
    await new Promise((r) => setImmediate(r));

    // The final .set('snyk-request-id', ...) must use the broker's UUID
    const setCalls: string[][] = res.set.mock.calls;
    const idCall = setCalls.find((args) => args[0] === 'snyk-request-id');
    expect(idCall).toBeDefined();
    expect(idCall![1]).toBe(BROKER_UUID);
    expect(idCall![1]).not.toBe(SNYK_API_UUID);
  });

  it('echoes broker UUID when Snyk API response omits snyk-request-id', async () => {
    (makeRequestToDownstream as jest.Mock).mockResolvedValue({
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });

    const req: any = makeMockReq();
    const res: any = makeMockRes();
    const handler = new HybridClientRequestHandler(req, res);
    handler.makeRequest({ url: '/webhook/github/aaaa' } as any, true);

    await new Promise((r) => setImmediate(r));

    const setCalls: string[][] = res.set.mock.calls;
    const idCall = setCalls.find((args) => args[0] === 'snyk-request-id');
    expect(idCall).toBeDefined();
    expect(idCall![1]).toBe(BROKER_UUID);
  });
});

describe('HybridClientRequestHandler — response carries snyk-request-id on WS paths', () => {
  const BROKER_UUID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const DOWNSTREAM_UUID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

  const makeMockReq = () => ({
    url: '/some/path',
    method: 'GET',
    body: '{}',
    headers: { 'snyk-request-id': BROKER_UUID },
    requestId: BROKER_UUID,
  });

  beforeEach(() => jest.clearAllMocks());

  it('sets broker snyk-request-id on WS response even when downstream echoes a different value', () => {
    const wsSend = jest.fn();
    const res: any = {
      locals: {
        websocket: { send: wsSend, identifier: 'id' },
        capabilities: [],
      },
      set: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    const handler = new HybridClientRequestHandler(makeMockReq() as any, res);
    handler.makeRequest({ url: '/some/path' } as any);

    const callback = wsSend.mock.calls[0][2];
    callback({
      status: 200,
      headers: {
        'snyk-request-id': DOWNSTREAM_UUID,
        'content-type': 'application/json',
      },
      body: '{}',
    });

    const idCall = (res.set.mock.calls as string[][]).find(
      (args) => args[0] === 'snyk-request-id',
    );
    expect(idCall).toBeDefined();
    expect(idCall![1]).toBe(BROKER_UUID);
    expect(idCall![1]).not.toBe(DOWNSTREAM_UUID);
  });

  it('sets broker snyk-request-id on WS response when downstream omits it', () => {
    const wsSend = jest.fn();
    const res: any = {
      locals: {
        websocket: { send: wsSend, identifier: 'id' },
        capabilities: [],
      },
      set: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    const handler = new HybridClientRequestHandler(makeMockReq() as any, res);
    handler.makeRequest({ url: '/some/path' } as any);

    const callback = wsSend.mock.calls[0][2];
    callback({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });

    const idCall = (res.set.mock.calls as string[][]).find(
      (args) => args[0] === 'snyk-request-id',
    );
    expect(idCall).toBeDefined();
    expect(idCall![1]).toBe(BROKER_UUID);
  });

  it('sets broker snyk-request-id header on streaming response before piping', () => {
    const wsSend = jest.fn();
    const res: any = Object.assign(new EventEmitter(), {
      locals: {
        websocket: { send: wsSend, identifier: 'id' },
        capabilities: ['post-streams'],
      },
      write: jest.fn(),
      end: jest.fn(),
      destroy: jest.fn(),
      setHeader: jest.fn(),
    });

    const handler = new HybridClientRequestHandler(makeMockReq() as any, res);
    handler.makeRequest({ url: '/some/path' } as any);

    expect(res.setHeader).toHaveBeenCalledWith('snyk-request-id', BROKER_UUID);
  });
});

describe('HybridClientRequestHandler — WS paths include snyk-request-id in payload', () => {
  const BROKER_UUID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  const makeMockReq = () => ({
    url: '/webhook/github/aaaa',
    method: 'POST',
    body: '{}',
    headers: { 'snyk-request-id': BROKER_UUID },
    requestId: BROKER_UUID,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('includes snyk-request-id in WS payload (websocket response path)', () => {
    const wsSend = jest.fn();
    const res: any = {
      locals: {
        websocket: { send: wsSend, identifier: 'test-identifier' },
        capabilities: [],
      },
    };

    const handler = new HybridClientRequestHandler(makeMockReq() as any, res);
    handler.makeRequest({ url: '/webhook/github/aaaa' } as any);

    expect(wsSend).toHaveBeenCalledWith(
      'request',
      expect.objectContaining({
        headers: expect.objectContaining({ 'snyk-request-id': BROKER_UUID }),
      }),
      expect.any(Function),
    );
  });

  it('includes snyk-request-id in WS payload (streaming response path)', () => {
    const wsSend = jest.fn();
    // The streaming path calls streamBuffer.pipe(this.res), so res must be
    // an EventEmitter-compatible writable to avoid a synchronous throw.
    const res: any = Object.assign(new EventEmitter(), {
      locals: {
        websocket: { send: wsSend, identifier: 'test-identifier' },
        capabilities: ['post-streams'],
      },
      write: jest.fn(),
      end: jest.fn(),
      destroy: jest.fn(),
      setHeader: jest.fn(),
    });

    const handler = new HybridClientRequestHandler(makeMockReq() as any, res);
    handler.makeRequest({ url: '/webhook/github/aaaa' } as any);

    expect(wsSend).toHaveBeenCalledWith(
      'request',
      expect.objectContaining({
        headers: expect.objectContaining({ 'snyk-request-id': BROKER_UUID }),
      }),
    );
  });
});
