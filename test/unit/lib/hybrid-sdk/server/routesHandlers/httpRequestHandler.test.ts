import { overloadHttpRequestWithConnectionDetailsMiddleware } from '../../../../../../lib/hybrid-sdk/server/routesHandlers/httpRequestHandler';
import { getSocketConnections } from '../../../../../../lib/hybrid-sdk/server/socket';
import { Request, Response, NextFunction } from 'express';

jest.mock('../../../../../../lib/hybrid-sdk/server/socket');

const mockedGetSocketConnections = getSocketConnections as jest.Mock;

describe('overloadHttpRequestWithConnectionDetailsMiddleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;
  let status: jest.Mock;
  let json: jest.Mock;
  let setHeader: jest.Mock;

  beforeEach(() => {
    jest.resetAllMocks();
    setHeader = jest.fn();
    json = jest.fn();
    status = jest.fn(() => ({ json }));
    req = {
      params: { token: 'test-token' },
      headers: {},
      url: '/broker/test-token/some/path',
    };
    res = {
      status,
      setHeader,
      locals: {},
    };
    next = jest.fn();
  });

  it('should return 404 if no connections are found for the token', async () => {
    mockedGetSocketConnections.mockReturnValue(new Map());

    await overloadHttpRequestWithConnectionDetailsMiddleware(
      req as Request,
      res as Response,
      next,
    );

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      ok: false,
    });
    expect(setHeader).toHaveBeenCalledWith(
      'x-broker-failure',
      'no-connection',
    );
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

    await overloadHttpRequestWithConnectionDetailsMiddleware(
      req as Request,
      res as Response,
      next,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      ok: false,
    });
    expect(setHeader).toHaveBeenCalledWith(
      'x-broker-failure',
      'bad-request',
    );
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

    await overloadHttpRequestWithConnectionDetailsMiddleware(
      req as Request,
      res as Response,
      next,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      ok: false,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next() if connection and metadata are valid', async () => {
    const mockConnections = new Map();
    mockConnections.set('test-token', [
      {
        socket: {},
        socketVersion: '1.0',
        metadata: { version: '1.2.3', capabilities: ['test'] },
      },
    ]);
    mockedGetSocketConnections.mockReturnValue(mockConnections);

    await overloadHttpRequestWithConnectionDetailsMiddleware(
      req as Request,
      res as Response,
      next,
    );

    expect(status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
    expect(res.locals).toHaveProperty('websocket');
    expect(res.locals).toHaveProperty('clientVersion', '1.2.3');
    expect(res.locals).toHaveProperty('capabilities', ['test']);
  });
});
