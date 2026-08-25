import { Request, Response } from 'express';
import { authRefreshHandler } from '../../lib/hybrid-sdk/server/routesHandlers/authHandlers';
import { Role } from '../../lib/hybrid-sdk/client/types/client';

jest.mock('../../lib/hybrid-sdk/server/socket', () => {
  const originalModule = jest.requireActual(
    '../../lib/hybrid-sdk/server/socket',
  );
  return {
    ...originalModule,
    getSocketConnectionByIdentifier: jest.fn(),
  };
});

jest.mock('../../lib/hybrid-sdk/server/auth/authHelpers', () => {
  const originalModule = jest.requireActual(
    '../../lib/hybrid-sdk/server/auth/authHelpers',
  );
  return {
    ...originalModule,
    validateBrokerClientCredentials: jest.fn(),
  };
});

import { getSocketConnectionByIdentifier } from '../../lib/hybrid-sdk/server/socket';
import {
  BrokerAuthError,
  validateBrokerClientCredentials,
} from '../../lib/hybrid-sdk/server/auth/authHelpers';

const IDENTIFIER = '00000000-0000-4000-8000-000000000001';
const BROKER_CLIENT_ID = '00000000-0000-4000-8000-000000000002';

describe('authRefreshHandler', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let statusMock: jest.Mock;
  let typeMock: jest.Mock;
  let sendMock: jest.Mock;

  const requestForRole = (role: Role): Partial<Request> => ({
    params: { identifier: IDENTIFIER },
    query: { connection_role: role },
    headers: {},
    body: Buffer.from(
      JSON.stringify({
        data: {
          attributes: { broker_client_id: BROKER_CLIENT_ID },
          id: IDENTIFIER,
          type: 'broker_connection',
        },
      }),
    ),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    statusMock = jest.fn().mockReturnThis();
    typeMock = jest.fn().mockReturnThis();
    sendMock = jest.fn().mockReturnThis();
    mockResponse = { status: statusMock, type: typeMock, send: sendMock };
    (validateBrokerClientCredentials as jest.Mock).mockResolvedValue(undefined);
    mockRequest = requestForRole(Role.primary);
  });

  // The pool is written by two places with different shapes: the websocket auth
  // hook (socket.ts) stores brokerClientId + role and no metadata, while the
  // identify hook (identifyHandler.ts) stores brokerClientId + metadata. Reading
  // metadata.clientId while scanning therefore threw on the metadata-less entry
  // and the handler answered 500 for a client it could have resolved.
  it('refreshes a client even when an earlier pool entry has no metadata', async () => {
    (getSocketConnectionByIdentifier as jest.Mock).mockReturnValue([
      {
        socketType: 'server',
        socketVersion: 1,
        brokerClientId: BROKER_CLIENT_ID,
        role: Role.secondary,
        metadata: undefined,
      },
      {
        socketType: 'server',
        socketVersion: 1,
        brokerClientId: BROKER_CLIENT_ID,
        role: Role.primary,
        metadata: { clientId: BROKER_CLIENT_ID, version: '4.182.0' },
      },
    ]);

    await authRefreshHandler(mockRequest as Request, mockResponse as Response);

    expect(statusMock).toHaveBeenCalledWith(201);
  });

  it('refreshes a client whose only pool entry has no metadata', async () => {
    (getSocketConnectionByIdentifier as jest.Mock).mockReturnValue([
      {
        socketType: 'server',
        socketVersion: 1,
        brokerClientId: BROKER_CLIENT_ID,
        role: Role.primary,
        metadata: undefined,
      },
    ]);

    await authRefreshHandler(mockRequest as Request, mockResponse as Response);

    expect(statusMock).toHaveBeenCalledWith(201);
  });

  it('stamps credsValidationTime on the pool entry itself', async () => {
    const poolEntry = {
      socketType: 'server',
      socketVersion: 1,
      brokerClientId: BROKER_CLIENT_ID,
      role: Role.primary,
      metadata: undefined,
      credsValidationTime: undefined as string | undefined,
    };
    (getSocketConnectionByIdentifier as jest.Mock).mockReturnValue([poolEntry]);

    await authRefreshHandler(mockRequest as Request, mockResponse as Response);

    expect(statusMock).toHaveBeenCalledWith(201);
    expect(poolEntry.credsValidationTime).toEqual(expect.any(String));
  });

  // A reconnect seats an authorize-only entry ahead of the live connection, so
  // both entries carry this client id and role. Stamping the placeholder would
  // leave the live connection's creds stale and the watchdog would close it.
  it('stamps the live connection, not a pending reconnect seated ahead of it', async () => {
    const pendingReconnect = {
      socketType: 'server',
      socketVersion: 1,
      brokerClientId: BROKER_CLIENT_ID,
      role: Role.primary,
      metadata: undefined,
      credsValidationTime: undefined as string | undefined,
    };
    const liveConnection = {
      socket: { end: () => undefined },
      socketType: 'server',
      socketVersion: 1,
      brokerClientId: BROKER_CLIENT_ID,
      role: Role.primary,
      metadata: { clientId: BROKER_CLIENT_ID, version: '4.182.0' },
      credsValidationTime: undefined as string | undefined,
    };
    const pool = [pendingReconnect, liveConnection];
    (getSocketConnectionByIdentifier as jest.Mock).mockReturnValue(pool);

    await authRefreshHandler(mockRequest as Request, mockResponse as Response);

    expect(statusMock).toHaveBeenCalledWith(201);
    expect(liveConnection.credsValidationTime).toEqual(expect.any(String));
    expect(pendingReconnect.credsValidationTime).toBeUndefined();
    // The pending entry must survive; it belongs to the in-flight handshake.
    expect(pool).toEqual([pendingReconnect, liveConnection]);
  });

  it('ends the live socket, not the pending reconnect, when validation fails', async () => {
    const endMock = jest.fn();
    (getSocketConnectionByIdentifier as jest.Mock).mockReturnValue([
      {
        socketType: 'server',
        socketVersion: 1,
        brokerClientId: BROKER_CLIENT_ID,
        role: Role.primary,
        metadata: undefined,
      },
      {
        socket: { end: endMock },
        socketType: 'server',
        socketVersion: 1,
        brokerClientId: BROKER_CLIENT_ID,
        role: Role.primary,
        metadata: { clientId: BROKER_CLIENT_ID, version: '4.182.0' },
      },
    ]);
    (validateBrokerClientCredentials as jest.Mock).mockRejectedValue(
      new BrokerAuthError('Invalid credentials.'),
    );

    await authRefreshHandler(mockRequest as Request, mockResponse as Response);

    expect(statusMock).toHaveBeenCalledWith(401);
    expect(endMock).toHaveBeenCalledTimes(1);
  });

  it('answers 401, not 500, when the role has no matching client', async () => {
    (getSocketConnectionByIdentifier as jest.Mock).mockReturnValue([
      {
        socketType: 'server',
        socketVersion: 1,
        brokerClientId: BROKER_CLIENT_ID,
        role: Role.secondary,
        metadata: undefined,
      },
    ]);

    await authRefreshHandler(mockRequest as Request, mockResponse as Response);

    expect(statusMock).toHaveBeenCalledWith(401);
  });

  it('answers 401 when the identifier has no connection at all', async () => {
    (getSocketConnectionByIdentifier as jest.Mock).mockReturnValue(undefined);

    await authRefreshHandler(mockRequest as Request, mockResponse as Response);

    expect(statusMock).toHaveBeenCalledWith(401);
  });

  it('answers 500 with a generic body that does not leak the cause', async () => {
    (getSocketConnectionByIdentifier as jest.Mock).mockImplementation(() => {
      throw new Error('redis exploded');
    });

    await authRefreshHandler(mockRequest as Request, mockResponse as Response);

    expect(statusMock).toHaveBeenCalledWith(500);
    expect(sendMock).toHaveBeenCalledWith('Unable to complete auth refresh.');
    expect(sendMock).not.toHaveBeenCalledWith(
      expect.stringContaining('redis exploded'),
    );
  });
});
