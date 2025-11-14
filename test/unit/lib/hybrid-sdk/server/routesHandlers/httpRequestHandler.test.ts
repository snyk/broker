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

  it('should return 400 if connection metadata is missing', async () => {
    const mockConnections = new Map();
    mockConnections.set('test-token', [
      {
        socket: {},
        socketVersion: '1.0',
        // metadata is intentionally missing
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
    expect(res.getHeader('x-broker-failure')).toBe('bad-request');
    expect(next).not.toHaveBeenCalled();
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
