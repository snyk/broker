import { overloadHttpRequestWithConnectionDetailsMiddleware } from '../../../../../../lib/hybrid-sdk/server/routesHandlers/httpRequestHandler';
import { getSocketConnections } from '../../../../../../lib/hybrid-sdk/server/socket';
import { makeStreamingRequestToDownstream } from '../../../../../../lib/hybrid-sdk/http/request';
import { hostname } from 'node:os';
import { NextFunction } from 'express';
import httpMocks from 'node-mocks-http';

jest.mock('../../../../../../lib/hybrid-sdk/server/socket');
jest.mock('../../../../../../lib/hybrid-sdk/http/request');
jest.mock('node:os', () => ({
  ...jest.requireActual('node:os'),
  hostname: jest.fn(),
}));

const mockedGetSocketConnections = getSocketConnections as jest.Mock;
const mockedMakeStreamingRequest =
  makeStreamingRequestToDownstream as jest.Mock;
const mockedHostname = hostname as jest.Mock;

describe('overloadHttpRequestWithConnectionDetailsMiddleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    jest.resetAllMocks();
    next = jest.fn();
    mockedHostname.mockReturnValue('broker-snyk-server-v2-0-0');
    delete process.env.BROKER_SERVER_MANDATORY_AUTH_ENABLED;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should return 404 if no connections are found for the token', async () => {
    mockedGetSocketConnections.mockReturnValue(new Map());
    const req = httpMocks.createRequest({
      params: { token: 'test-token' },
      url: '/broker/test-token/some/path',
    });
    const res = httpMocks.createResponse();

    await overloadHttpRequestWithConnectionDetailsMiddleware(req, res, next);

    expect(res.statusCode).toBe(404);
    expect(res._getJSONData()).toEqual({ ok: false });
    expect(res.getHeader('x-broker-failure')).toBe('no-connection');
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 503 after exhausting retries if the connection never finishes its handshake', async () => {
    jest.useFakeTimers();
    const mockConnections = new Map();
    mockConnections.set('test-token', [
      {
        // mid-handshake: seated but not yet identified
        socketVersion: '1.0',
        // socket and metadata are intentionally missing, and never arrive
      },
    ]);
    mockedGetSocketConnections.mockReturnValue(mockConnections);
    const req = httpMocks.createRequest({
      params: { token: 'test-token' },
      url: '/broker/test-token/some/path',
    });
    const res = httpMocks.createResponse();

    const pending = overloadHttpRequestWithConnectionDetailsMiddleware(
      req,
      res,
      next,
    );
    // Drive all the backoff sleeps to completion.
    await jest.advanceTimersByTimeAsync(5000);
    await pending;

    expect(res.statusCode).toBe(503);
    expect(res._getJSONData()).toEqual({ ok: false });
    expect(res.getHeader('x-broker-failure')).toBe('connection-not-ready');
    expect(res.getHeader('Retry-After')).toBe('1');
    expect(next).not.toHaveBeenCalled();
  });

  it('should retry and serve the request once the connection becomes ready', async () => {
    jest.useFakeTimers();
    const mockConnections = new Map();
    // Starts mid-handshake; identify() completes after the first backoff.
    const entry: Record<string, unknown> = { socketVersion: '1.0' };
    mockConnections.set('test-token', [entry]);
    mockedGetSocketConnections.mockReturnValue(mockConnections);
    const req = httpMocks.createRequest({
      params: { token: 'test-token' },
      url: '/broker/test-token/some/path',
    });
    const res = httpMocks.createResponse();

    const pending = overloadHttpRequestWithConnectionDetailsMiddleware(
      req,
      res,
      next,
    );
    // Simulate identify() merging in the socket + metadata mid-retry.
    entry.socket = {};
    entry.metadata = { version: '1.2.3', capabilities: ['test'] };
    await jest.advanceTimersByTimeAsync(100);
    await pending;

    expect(res.statusCode).toBe(200);
    expect(next).toHaveBeenCalled();
    expect(res.locals.websocket).toEqual(entry.socket);
    expect(res.locals.clientVersion).toEqual('1.2.3');
  });

  it('should select the ready connection over an authorize-only entry seated ahead of it', async () => {
    const mockConnections = new Map();
    const readyConnection = {
      socket: {},
      socketVersion: '1.0',
      metadata: { version: '1.2.3', capabilities: ['test'] },
    };
    mockConnections.set('test-token', [
      // newest-first: an authorize-only entry sits at index 0 during reconnect
      { socketVersion: '1.0' },
      readyConnection,
    ]);
    mockedGetSocketConnections.mockReturnValue(mockConnections);
    const req = httpMocks.createRequest({
      params: { token: 'test-token' },
      url: '/broker/test-token/some/path',
    });
    const res = httpMocks.createResponse();

    await overloadHttpRequestWithConnectionDetailsMiddleware(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(next).toHaveBeenCalled();
    expect(res.locals.websocket).toEqual(readyConnection.socket);
    expect(res.locals.clientVersion).toEqual(readyConnection.metadata.version);
  });

  it('should return 400 if capabilities are missing from metadata', async () => {
    const mockConnections = new Map();
    mockConnections.set('test-token', [
      {
        socket: {},
        socketVersion: '1.0',
        metadata: { version: '1.2.3' }, // capabilities are missing
      },
    ]);
    mockedGetSocketConnections.mockReturnValue(mockConnections);
    const req = httpMocks.createRequest({
      params: { token: 'test-token' },
      url: '/broker/test-token/some/path',
    });
    const res = httpMocks.createResponse();

    await overloadHttpRequestWithConnectionDetailsMiddleware(req, res, next);

    expect(res.statusCode).toBe(400);
    expect(res._getJSONData()).toEqual({ ok: false });
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next() if connection and metadata are valid', async () => {
    const mockConnections = new Map();
    const connection = {
      socket: {},
      socketVersion: '1.0',
      metadata: { version: '1.2.3', capabilities: ['test'] },
    };
    mockConnections.set('test-token', [connection]);
    mockedGetSocketConnections.mockReturnValue(mockConnections);
    const req = httpMocks.createRequest({
      params: { token: 'test-token' },
      url: '/broker/test-token/some/path',
    });
    const res = httpMocks.createResponse();

    await overloadHttpRequestWithConnectionDetailsMiddleware(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(next).toHaveBeenCalled();
    expect(res.locals.websocket).toEqual(connection.socket);
    expect(res.locals.clientVersion).toEqual(connection.metadata.version);
    expect(res.locals.capabilities).toEqual(connection.metadata.capabilities);
    expect(res.locals.socketVersion).toEqual(connection.socketVersion);
    expect(res.locals.brokerAppClientId).toEqual('');
  });

  describe('secondary pod forwarding to primary via headless DNS', () => {
    beforeEach(() => {
      mockedGetSocketConnections.mockReturnValue(new Map());
    });

    it('should forward to primary pod via headless service DNS (single-digit shard)', async () => {
      mockedHostname.mockReturnValue('broker-snyk-server-v2-1-1');
      mockedMakeStreamingRequest.mockResolvedValue({
        statusCode: 404,
        headers: { 'x-broker-failure': 'no-connection' },
        pipe: jest.fn(),
      });
      const req = httpMocks.createRequest({
        params: { token: 'test-token' },
        url: '/broker/test-token/some/path',
        hostname: 'broker-snyk-server-v2-1.default.svc.cluster.local',
        socket: { localPort: 5000 },
      });
      const res = httpMocks.createResponse();

      await overloadHttpRequestWithConnectionDetailsMiddleware(req, res, next);

      expect(mockedMakeStreamingRequest).toHaveBeenCalledTimes(1);
      const forwardedUrl = mockedMakeStreamingRequest.mock.calls[0][0].url;
      expect(forwardedUrl).toContain(
        'broker-snyk-server-v2-1-0.broker-snyk-server-v2-1-headless',
      );
      expect(forwardedUrl).toContain(':5000');
      expect(forwardedUrl).toContain('connection_role=primary');
      expect(next).not.toHaveBeenCalled();
    });

    it('should forward to primary pod via headless service DNS (double-digit shard)', async () => {
      mockedHostname.mockReturnValue('broker-snyk-server-v2-15-1');
      mockedMakeStreamingRequest.mockResolvedValue({
        statusCode: 404,
        headers: { 'x-broker-failure': 'no-connection' },
        pipe: jest.fn(),
      });
      const req = httpMocks.createRequest({
        params: { token: 'test-token' },
        url: '/broker/test-token/some/path',
        hostname: 'broker-snyk-server-v2-15.default.svc.cluster.local',
        socket: { localPort: 5000 },
      });
      const res = httpMocks.createResponse();

      await overloadHttpRequestWithConnectionDetailsMiddleware(req, res, next);

      const forwardedUrl = mockedMakeStreamingRequest.mock.calls[0][0].url;
      expect(forwardedUrl).toContain(
        'broker-snyk-server-v2-15-0.broker-snyk-server-v2-15-headless',
      );
    });

    it('should relay the primary response verbatim (status + headers)', async () => {
      mockedHostname.mockReturnValue('broker-snyk-server-v2-3-1');
      const mockPipe = jest.fn();
      mockedMakeStreamingRequest.mockResolvedValue({
        statusCode: 404,
        headers: {
          'x-broker-failure': 'no-connection',
          'content-type': 'application/json',
        },
        pipe: mockPipe,
      });
      const req = httpMocks.createRequest({
        params: { token: 'test-token' },
        url: '/broker/test-token/some/path',
        hostname: 'broker-snyk-server-v2-3.default.svc.cluster.local',
        socket: { localPort: 5000 },
      });
      const res = httpMocks.createResponse();

      await overloadHttpRequestWithConnectionDetailsMiddleware(req, res, next);

      expect(res.statusCode).toBe(404);
      expect(mockPipe).toHaveBeenCalledWith(res);
      expect(next).not.toHaveBeenCalled();
    });

    it('should relay a successful response from primary (legacy token found)', async () => {
      mockedHostname.mockReturnValue('broker-snyk-server-v2-5-1');
      const mockPipe = jest.fn();
      mockedMakeStreamingRequest.mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        pipe: mockPipe,
      });
      const req = httpMocks.createRequest({
        params: { token: 'test-token' },
        url: '/broker/test-token/some/path',
        hostname: 'broker-snyk-server-v2-5.default.svc.cluster.local',
        socket: { localPort: 5000 },
      });
      const res = httpMocks.createResponse();

      await overloadHttpRequestWithConnectionDetailsMiddleware(req, res, next);

      expect(res.statusCode).toBe(200);
      expect(mockPipe).toHaveBeenCalledWith(res);
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 500 with x-broker-failure when forward to primary fails', async () => {
      mockedHostname.mockReturnValue('broker-snyk-server-v2-7-1');
      mockedMakeStreamingRequest.mockRejectedValue(
        new Error('getaddrinfo NXDOMAIN'),
      );
      const req = httpMocks.createRequest({
        params: { token: 'test-token' },
        url: '/broker/test-token/some/path',
        hostname: 'broker-snyk-server-v2-7.default.svc.cluster.local',
        socket: { localPort: 5000 },
      });
      const res = httpMocks.createResponse();

      await overloadHttpRequestWithConnectionDetailsMiddleware(req, res, next);

      expect(res.statusCode).toBe(500);
      expect(res.getHeader('x-broker-failure')).toBe(
        'error-forwarding-to-primary',
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should forward POST body to primary', async () => {
      mockedHostname.mockReturnValue('broker-snyk-server-v2-2-1');
      mockedMakeStreamingRequest.mockResolvedValue({
        statusCode: 200,
        headers: {},
        pipe: jest.fn(),
      });
      const req = httpMocks.createRequest({
        method: 'POST',
        params: { token: 'test-token' },
        url: '/broker/test-token/some/path',
        hostname: 'broker-snyk-server-v2-2.default.svc.cluster.local',
        socket: { localPort: 5000 },
        body: { key: 'value' },
      });
      const res = httpMocks.createResponse();

      await overloadHttpRequestWithConnectionDetailsMiddleware(req, res, next);

      const forwardedReq = mockedMakeStreamingRequest.mock.calls[0][0];
      expect(forwardedReq.body).toEqual({ key: 'value' });
      expect(forwardedReq.method).toBe('POST');
    });

    it('should NOT forward on primary pod (hostname ends with -0)', async () => {
      mockedHostname.mockReturnValue('broker-snyk-server-v2-1-0');
      const req = httpMocks.createRequest({
        params: { token: 'test-token' },
        url: '/broker/test-token/some/path',
      });
      const res = httpMocks.createResponse();

      await overloadHttpRequestWithConnectionDetailsMiddleware(req, res, next);

      expect(mockedMakeStreamingRequest).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(404);
      expect(res.getHeader('x-broker-failure')).toBe('no-connection');
    });

    it('should NOT forward when BROKER_SERVER_MANDATORY_AUTH_ENABLED is set (universal)', async () => {
      process.env.BROKER_SERVER_MANDATORY_AUTH_ENABLED = 'true';
      mockedHostname.mockReturnValue('broker-snyk-server-v2-1-1');
      const req = httpMocks.createRequest({
        params: { token: 'test-token' },
        url: '/broker/test-token/some/path',
      });
      const res = httpMocks.createResponse();

      await overloadHttpRequestWithConnectionDetailsMiddleware(req, res, next);

      expect(mockedMakeStreamingRequest).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(404);
      expect(res.getHeader('x-broker-failure')).toBe('no-connection');
    });
  });
});
