import { ISpark } from 'primus';

jest.mock('../../../../../../lib/hybrid-sdk/server/infra/dispatcher', () => ({
  clientDisconnected: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../../../../lib/hybrid-sdk/common/utils/metrics', () => ({
  decrementSocketConnectionGauge: jest.fn(),
}));
jest.mock(
  '../../../../../../lib/hybrid-sdk/server/socketHandlers/identifyHandler',
  () => ({ rmClientIdFromTerminationMap: jest.fn() }),
);

import { handleConnectionCloseOnSocket } from '../../../../../../lib/hybrid-sdk/server/socketHandlers/closeHandler';
import { clientDisconnected } from '../../../../../../lib/hybrid-sdk/server/infra/dispatcher';
import {
  ClientSocket,
  getSocketConnections,
  wasRecentlyDisconnected,
} from '../../../../../../lib/hybrid-sdk/server/socket';
import { Role } from '../../../../../../lib/hybrid-sdk/client/types/client';

const TOKEN = 'test-token';
const BROKER_CLIENT_ID = 'client-1';
const HANDSHAKE_ID = 'request-a';

const sparkWithHeaders = (headers: Record<string, string>): ISpark =>
  ({ request: { headers } } as unknown as ISpark);

const closingSpark = (overrides: Record<string, string> = {}): ISpark =>
  sparkWithHeaders({
    'x-snyk-broker-client-id': BROKER_CLIENT_ID,
    'x-snyk-broker-client-role': Role.primary,
    'snyk-request-id': HANDSHAKE_ID,
    ...overrides,
  });

const pendingEntry = (overrides: Partial<ClientSocket> = {}): ClientSocket => ({
  socketType: 'server',
  socketVersion: 1,
  brokerClientId: BROKER_CLIENT_ID,
  brokerAppClientId: 'app-1',
  role: Role.primary,
  handshakeStartTime: Date.now(),
  handshakeId: HANDSHAKE_ID,
  ...overrides,
});

describe('handleConnectionCloseOnSocket', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    getSocketConnections().clear();
  });
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    getSocketConnections().clear();
  });

  // Without this the authorize placeholder survives the disconnect and is only
  // collected later, by the handshake TTL sweep on the next inbound request.
  it('removes the authorize placeholder when the socket closes before identify', () => {
    getSocketConnections().set(TOKEN, [pendingEntry()]);

    handleConnectionCloseOnSocket('close', closingSpark(), TOKEN, '', false);

    expect(getSocketConnections().has(TOKEN)).toBe(false);
    expect(wasRecentlyDisconnected(TOKEN)).toBe(false);
    expect(clientDisconnected).not.toHaveBeenCalled();
  });

  // Overlapping reconnects share one pool entry, and the newer handshake owns
  // it. The older socket closing must not take the newer one's authorization
  // state with it.
  it('leaves the entry alone when a newer handshake has replaced it', () => {
    const newerHandshake = pendingEntry({ handshakeId: 'request-b' });
    getSocketConnections().set(TOKEN, [newerHandshake]);

    handleConnectionCloseOnSocket(
      'close',
      closingSpark({ 'snyk-request-id': 'request-a' }),
      TOKEN,
      '',
      false,
    );

    expect(getSocketConnections().get(TOKEN)).toEqual([newerHandshake]);
  });

  it('matches the role stored by authorize when the role header is absent', () => {
    // authorize() stores '' when the client sends no role header.
    getSocketConnections().set(TOKEN, [pendingEntry({ role: '' as Role })]);
    const socket = sparkWithHeaders({
      'x-snyk-broker-client-id': BROKER_CLIENT_ID,
      'snyk-request-id': HANDSHAKE_ID,
    });

    handleConnectionCloseOnSocket('close', socket, TOKEN, '', false);

    expect(getSocketConnections().has(TOKEN)).toBe(false);
  });

  it('leaves a live connection for the same client id in place', () => {
    const liveEntry = pendingEntry({
      socket: { end: () => undefined },
      metadata: { version: '1.2.3', capabilities: ['test'] },
    });
    getSocketConnections().set(TOKEN, [liveEntry]);

    handleConnectionCloseOnSocket('close', closingSpark(), TOKEN, '', false);

    expect(getSocketConnections().get(TOKEN)).toEqual([liveEntry]);
  });

  it('retains the disconnect marker when a pending reconnect also closes', () => {
    const oldSocket = closingSpark({ 'snyk-request-id': 'request-a' });
    const reconnectingSocket = closingSpark({
      'snyk-request-id': 'request-b',
    });
    const pendingReconnect = pendingEntry({
      handshakeId: 'request-b',
      handshakeStartTime: Date.now(),
    });
    const oldConnection = pendingEntry({
      socket: oldSocket as unknown as { end() },
      metadata: { version: '1.2.3', capabilities: ['test'] },
      handshakeId: 'request-a',
    });
    getSocketConnections().set(TOKEN, [pendingReconnect, oldConnection]);

    handleConnectionCloseOnSocket(
      'close',
      oldSocket,
      TOKEN,
      BROKER_CLIENT_ID,
      true,
    );

    expect(getSocketConnections().get(TOKEN)).toEqual([pendingReconnect]);
    expect(wasRecentlyDisconnected(TOKEN)).toBe(true);

    handleConnectionCloseOnSocket(
      'close',
      reconnectingSocket,
      TOKEN,
      '',
      false,
    );

    expect(getSocketConnections().has(TOKEN)).toBe(false);
    expect(wasRecentlyDisconnected(TOKEN)).toBe(true);
  });

  it('does not mark the token when another live socket remains', () => {
    const closingSocket = closingSpark({ 'snyk-request-id': 'request-a' });
    const remainingSocket = closingSpark({
      'snyk-request-id': 'request-b',
    });
    const closingConnection = pendingEntry({
      socket: closingSocket as unknown as { end() },
      metadata: { version: '1.2.3', capabilities: ['test'] },
      handshakeId: 'request-a',
    });
    const remainingConnection = pendingEntry({
      socket: remainingSocket as unknown as { end() },
      metadata: { version: '1.2.3', capabilities: ['test'] },
      handshakeId: 'request-b',
    });
    getSocketConnections().set(TOKEN, [closingConnection, remainingConnection]);

    handleConnectionCloseOnSocket(
      'close',
      closingSocket,
      TOKEN,
      BROKER_CLIENT_ID,
      true,
    );

    expect(getSocketConnections().get(TOKEN)).toEqual([remainingConnection]);
    expect(wasRecentlyDisconnected(TOKEN)).toBe(false);
  });

  it('removes the entry by socket identity when the client had identified', () => {
    const identifiedSocket = closingSpark();
    getSocketConnections().set(TOKEN, [
      pendingEntry({
        socket: identifiedSocket as unknown as { end() },
        metadata: { version: '1.2.3', capabilities: ['test'] },
      }),
    ]);

    handleConnectionCloseOnSocket('close', identifiedSocket, TOKEN, '', true);

    expect(getSocketConnections().has(TOKEN)).toBe(false);
    expect(clientDisconnected).not.toHaveBeenCalled();
  });
});
