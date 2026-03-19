import { Request, Response } from 'express';
import { connectionsStatusHandler } from '../../lib/hybrid-sdk/server/routesHandlers/connectionStatusHandler';

jest.mock('../../lib/hybrid-sdk/server/socket', () => {
  const originalModule = jest.requireActual(
    '../../lib/hybrid-sdk/server/socket',
  );
  return {
    ...originalModule,
    getSocketConnections: jest.fn(),
  };
});

import { getSocketConnections } from '../../lib/hybrid-sdk/server/socket';

describe('connectionStatusHandler', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let statusMock: jest.Mock;
  let jsonMock: jest.Mock;

  beforeEach(() => {
    statusMock = jest.fn().mockReturnThis();
    jsonMock = jest.fn().mockReturnThis();

    mockRequest = {
      params: {},
    };

    mockResponse = {
      status: statusMock,
      json: jsonMock,
    };

    jest.clearAllMocks();
  });

  describe('connectionsStatusHandler', () => {
    it('should filter out connections with missing metadata', async () => {
      const mockConnections = new Map();
      mockConnections.set('token-1', [
        {
          brokerClientId: 'client-1',
          metadata: { version: '4.182.0' },
        },
        {
          brokerClientId: 'client-2',
          metadata: undefined,
        },
        {
          brokerClientId: 'client-3',
        },
      ]);

      (getSocketConnections as jest.Mock).mockReturnValue(mockConnections);

      await connectionsStatusHandler(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith([
        {
          identifier: expect.any(String),
          hashedIdentifier: expect.any(String),
          versions: ['4.182.0'],
          brokerClientIds: ['client-1', 'client-2', 'client-3'],
        },
      ]);
    });

    it('should handle connections with all metadata present', async () => {
      const mockConnections = new Map();
      mockConnections.set('token-1', [
        {
          brokerClientId: 'client-1',
          metadata: { version: '4.182.0' },
        },
        {
          brokerClientId: 'client-2',
          metadata: { version: '4.180.0' },
        },
      ]);

      (getSocketConnections as jest.Mock).mockReturnValue(mockConnections);

      await connectionsStatusHandler(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith([
        {
          identifier: expect.any(String),
          hashedIdentifier: expect.any(String),
          versions: ['4.182.0', '4.180.0'],
          brokerClientIds: ['client-1', 'client-2'],
        },
      ]);
    });
  });
});
