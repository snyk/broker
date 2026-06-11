import {
  clearEventSocket,
  emitError,
  registerEventSocket,
} from '../../../../../lib/hybrid-sdk/client/events';
import { CLIENT_EVENT_MESSAGE } from '../../../../../lib/hybrid-sdk/common/types/telemetry';

describe('client/events — emitError', () => {
  const makeSocket = () => ({ send: jest.fn() });

  afterEach(() => {
    clearEventSocket();
    jest.restoreAllMocks();
  });

  it('no-ops (does not throw) when no socket is registered', () => {
    expect(() =>
      emitError({ errorCode: 'JWT_REFRESH_FAILED' }),
    ).not.toThrow();
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

  it('stops sending after clearEventSocket', () => {
    const socket = makeSocket();
    registerEventSocket(socket);
    clearEventSocket();

    emitError({ errorCode: 'AUTH_RENEWAL_FAILED' });

    expect(socket.send).not.toHaveBeenCalled();
  });

  it('swallows a socket.send failure (best-effort, never disrupts the caller)', () => {
    const socket = {
      send: jest.fn(() => {
        throw new Error('socket gone');
      }),
    };
    registerEventSocket(socket);

    expect(() =>
      emitError({ errorCode: 'AUTH_RENEWAL_FAILED' }),
    ).not.toThrow();
  });
});
