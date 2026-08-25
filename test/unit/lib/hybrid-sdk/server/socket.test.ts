import {
  addAuthorizedHandshake,
  ClientSocket,
  findClientToRefreshCreds,
  getSocketConnections,
  removePendingHandshake,
} from '../../../../../lib/hybrid-sdk/server/socket';
import { HandshakeIdentity } from '../../../../../lib/hybrid-sdk/server/auth/authHelpers';
import { Role } from '../../../../../lib/hybrid-sdk/client/types/client';

const TOKEN = 'test-token';
const BROKER_CLIENT_ID = 'client-1';
const HANDSHAKE_ID = 'request-a';

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

const identity = (
  overrides: Partial<HandshakeIdentity> = {},
): HandshakeIdentity => ({
  brokerClientId: BROKER_CLIENT_ID,
  role: Role.primary,
  handshakeId: HANDSHAKE_ID,
  ...overrides,
});

describe('findClientToRefreshCreds', () => {
  const liveEntry = pendingEntry({
    socket: { end: () => undefined },
    metadata: { version: '1.2.3', capabilities: ['test'] },
    handshakeId: 'request-a',
  });
  const pendingReconnect = pendingEntry({ handshakeId: 'request-b' });

  it('prefers the live connection over a pending reconnect', () => {
    expect(
      findClientToRefreshCreds(
        [pendingReconnect, liveEntry],
        BROKER_CLIENT_ID,
        Role.primary,
      ),
    ).toBe(liveEntry);
  });

  it('falls back to the only entry when no socket is attached yet', () => {
    expect(
      findClientToRefreshCreds(
        [pendingReconnect],
        BROKER_CLIENT_ID,
        Role.primary,
      ),
    ).toBe(pendingReconnect);
  });

  it('ignores an entry with a different role', () => {
    expect(
      findClientToRefreshCreds([liveEntry], BROKER_CLIENT_ID, Role.secondary),
    ).toBeUndefined();
  });

  it('ignores an entry with a different broker client id', () => {
    expect(
      findClientToRefreshCreds([liveEntry], 'other-client', Role.primary),
    ).toBeUndefined();
  });
});

describe('addAuthorizedHandshake', () => {
  beforeEach(() => {
    getSocketConnections().clear();
  });
  afterEach(() => {
    getSocketConnections().clear();
  });

  it('keeps a reconnect separate from an identified connection', () => {
    const identifiedSocket = { end: () => undefined };
    const identifiedConnection = pendingEntry({
      socket: identifiedSocket,
      metadata: { version: '1.2.3', capabilities: ['test'] },
      handshakeId: 'request-a',
    });
    const reconnect = pendingEntry({ handshakeId: 'request-b' });
    getSocketConnections().set(TOKEN, [identifiedConnection]);

    addAuthorizedHandshake(TOKEN, reconnect);

    expect(getSocketConnections().get(TOKEN)).toEqual([
      reconnect,
      identifiedConnection,
    ]);
  });

  it('replaces an existing pending attempt for the same client and role', () => {
    const oldAttempt = pendingEntry({ handshakeId: 'request-a' });
    const newAttempt = pendingEntry({ handshakeId: 'request-b' });
    getSocketConnections().set(TOKEN, [oldAttempt]);

    addAuthorizedHandshake(TOKEN, newAttempt);

    expect(getSocketConnections().get(TOKEN)).toEqual([newAttempt]);
  });
});

describe('removePendingHandshake', () => {
  beforeEach(() => {
    getSocketConnections().clear();
  });
  afterEach(() => {
    getSocketConnections().clear();
  });

  it('removes the authorize-only entry for this handshake', () => {
    getSocketConnections().set(TOKEN, [pendingEntry()]);

    expect(removePendingHandshake(TOKEN, identity())).toBe(true);
    // The pool is now empty, so the token itself is gone.
    expect(getSocketConnections().has(TOKEN)).toBe(false);
  });

  it('keeps the other entries in the pool', () => {
    const otherRole = pendingEntry({
      role: Role.secondary,
      handshakeId: 'request-b',
    });
    getSocketConnections().set(TOKEN, [pendingEntry(), otherRole]);

    expect(removePendingHandshake(TOKEN, identity())).toBe(true);
    expect(getSocketConnections().get(TOKEN)).toEqual([otherRole]);
  });

  // authorize() coalesces overlapping handshakes for the same client id and role
  // into one entry, so the newer handshake owns it. Deleting it here would make
  // identify() rebuild the entry without brokerAppClientId, role or
  // credsValidationTime, which fails response auth and trips the stale-creds
  // watchdog.
  it('does not remove the entry once a newer handshake owns it', () => {
    const newerHandshake = pendingEntry({ handshakeId: 'request-b' });
    getSocketConnections().set(TOKEN, [newerHandshake]);

    expect(
      removePendingHandshake(TOKEN, identity({ handshakeId: 'request-a' })),
    ).toBe(false);
    expect(getSocketConnections().get(TOKEN)).toEqual([newerHandshake]);
  });

  // A reconnect can seat a second socket for the same client id and role. If
  // that socket dies before identify, the entry still belongs to the live
  // connection, and removing it would take a working client offline.
  it('does not remove an entry that already holds a socket', () => {
    const liveEntry = pendingEntry({
      socket: { end: () => undefined },
      metadata: { version: '1.2.3', capabilities: ['test'] },
    });
    getSocketConnections().set(TOKEN, [liveEntry]);

    expect(removePendingHandshake(TOKEN, identity())).toBe(false);
    expect(getSocketConnections().get(TOKEN)).toEqual([liveEntry]);
  });

  it('does nothing when the broker client id is missing', () => {
    getSocketConnections().set(TOKEN, [pendingEntry()]);

    expect(
      removePendingHandshake(TOKEN, identity({ brokerClientId: undefined })),
    ).toBe(false);
    expect(getSocketConnections().get(TOKEN)).toHaveLength(1);
  });

  // No snyk-request-id means the handshake cannot be matched safely, so the
  // entry is left to the handshake TTL sweep.
  it('does nothing when the handshake id is missing', () => {
    getSocketConnections().set(TOKEN, [
      pendingEntry({ handshakeId: undefined }),
    ]);

    expect(
      removePendingHandshake(TOKEN, identity({ handshakeId: undefined })),
    ).toBe(false);
    expect(getSocketConnections().get(TOKEN)).toHaveLength(1);
  });

  it('does nothing when the token has no pool', () => {
    expect(removePendingHandshake(TOKEN, identity())).toBe(false);
  });
});
