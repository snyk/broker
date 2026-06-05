import { overloadHttpRequestWithConnectionDetailsMiddleware } from '../../../../../../lib/hybrid-sdk/server/routesHandlers/httpRequestHandler';
import { getSocketConnections } from '../../../../../../lib/hybrid-sdk/server/socket';
import { NextFunction } from 'express';
import httpMocks from 'node-mocks-http';

jest.mock('../../../../../../lib/hybrid-sdk/server/socket');

const mockedGetSocketConnections = getSocketConnections as jest.Mock;

describe('overloadHttpRequestWithConnectionDetailsMiddleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    jest.resetAllMocks();
    next = jest.fn();
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
});
