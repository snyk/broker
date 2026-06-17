import {
  clearEventSocket,
  emitError,
  emitShutdown,
  registerEventSocket,
} from '../../../../../lib/hybrid-sdk/client/events';
import {
  CLIENT_EVENT_MESSAGE,
  PROCESS_EXIT_REASONS,
} from '../../../../../lib/hybrid-sdk/common/types/telemetry';

// Track every socket handed out so afterEach can remove it from the registry
// (the registry is module-level and persists across tests).
const registeredSockets: Array<{ send: jest.Mock }> = [];
const makeSocket = () => {
  const socket = { send: jest.fn() };
  registeredSockets.push(socket);
  return socket;
};

afterEach(() => {
  registeredSockets.forEach((socket) => clearEventSocket(socket));
  registeredSockets.length = 0;
  jest.restoreAllMocks();
});

describe('client/events — emitError', () => {
  it('no-ops (does not throw) when no socket is registered', () => {
    expect(() => emitError({ errorCode: 'JWT_REFRESH_FAILED' })).not.toThrow();
  });

  it('sends a client-error envelope over the registered socket', () => {
    const socket = makeSocket();
    registerEventSocket(socket);

    emitError({
      errorCode: 'SEND_BACK_FAILED',
      requestId: 'req-1',
      integrationType: 'github',
    });

    expect(socket.send).toHaveBeenCalledTimes(1);
    const [message, envelope] = socket.send.mock.calls[0];
    expect(message).toBe(CLIENT_EVENT_MESSAGE);
    expect(typeof envelope.ts).toBe('number');
    expect(envelope.event).toEqual({
      type: 'client-error',
      errorCode: 'SEND_BACK_FAILED',
      requestId: 'req-1',
      integrationType: 'github',
    });
  });

  it('omits optional fields when not provided — no free-form / undefined keys', () => {
    const socket = makeSocket();
    registerEventSocket(socket);

    emitError({ errorCode: 'JWT_REFRESH_FAILED' });

    const envelope = socket.send.mock.calls[0][1];
    expect(envelope.event).toEqual({
      type: 'client-error',
      errorCode: 'JWT_REFRESH_FAILED',
    });
    // Only bounded keys ever reach the wire.
    expect(Object.keys(envelope.event).sort()).toEqual(['errorCode', 'type']);
  });

  it('stops sending after the registered socket is cleared', () => {
    const socket = makeSocket();
    registerEventSocket(socket);
    clearEventSocket(socket);

    emitError({ errorCode: 'AUTH_RENEWAL_FAILED' });

    expect(socket.send).not.toHaveBeenCalled();
  });

  it('swallows a socket.send failure (best-effort, never disrupts the caller)', () => {
    const socket = makeSocket();
    socket.send.mockImplementation(() => {
      throw new Error('socket gone');
    });
    registerEventSocket(socket);

    expect(() => emitError({ errorCode: 'AUTH_RENEWAL_FAILED' })).not.toThrow();
  });
});

describe('client/events — multiple concurrent connections', () => {
  it('keeps emitting over a surviving socket when another connection closes', () => {
    const closed = makeSocket();
    const healthy = makeSocket();
    registerEventSocket(closed);
    registerEventSocket(healthy);

    // One connection drops — its socket is removed, the rest stay live.
    clearEventSocket(closed);

    emitError({ errorCode: 'AUTH_RENEWAL_FAILED' });

    expect(closed.send).not.toHaveBeenCalled();
    expect(healthy.send).toHaveBeenCalledTimes(1);
  });

  it('emits over exactly one socket (does not broadcast to every connection)', () => {
    const a = makeSocket();
    const b = makeSocket();
    registerEventSocket(a);
    registerEventSocket(b);

    emitError({ errorCode: 'AUTH_RENEWAL_FAILED' });

    expect(a.send.mock.calls.length + b.send.mock.calls.length).toBe(1);
  });

  it('goes silent only once every connection has closed', () => {
    const a = makeSocket();
    const b = makeSocket();
    registerEventSocket(a);
    registerEventSocket(b);
    clearEventSocket(a);
    clearEventSocket(b);

    expect(() =>
      emitShutdown({ reason: 'clean', uptimeSeconds: 1 }),
    ).not.toThrow();
    expect(a.send).not.toHaveBeenCalled();
    expect(b.send).not.toHaveBeenCalled();
  });
});

describe('client/events — emitShutdown', () => {
  it('no-ops (does not throw) when no socket is registered', () => {
    expect(() =>
      emitShutdown({ reason: 'clean', uptimeSeconds: 5 }),
    ).not.toThrow();
  });

  it('sends a client-shutdown envelope over the registered socket', () => {
    const socket = makeSocket();
    registerEventSocket(socket);

    emitShutdown({
      reason: PROCESS_EXIT_REASONS.RECONNECT_EXHAUSTION,
      uptimeSeconds: 42,
    });

    expect(socket.send).toHaveBeenCalledTimes(1);
    const [message, envelope] = socket.send.mock.calls[0];
    expect(message).toBe(CLIENT_EVENT_MESSAGE);
    expect(typeof envelope.ts).toBe('number');
    expect(envelope.event).toEqual({
      type: 'client-shutdown',
      reason: PROCESS_EXIT_REASONS.RECONNECT_EXHAUSTION,
      uptimeSeconds: 42,
    });
  });

  it('carries the bounded errno code only when provided (uncaught_exception)', () => {
    const socket = makeSocket();
    registerEventSocket(socket);

    emitShutdown({
      reason: PROCESS_EXIT_REASONS.UNCAUGHT_EXCEPTION,
      uptimeSeconds: 7,
      errorCode: 'ECONNRESET',
    });

    const envelope = socket.send.mock.calls[0][1];
    expect(envelope.event).toEqual({
      type: 'client-shutdown',
      reason: PROCESS_EXIT_REASONS.UNCAUGHT_EXCEPTION,
      uptimeSeconds: 7,
      errorCode: 'ECONNRESET',
    });
  });
});
