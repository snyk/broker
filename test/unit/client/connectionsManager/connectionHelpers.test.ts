import { shutDownConnectionPair } from '../../../../lib/hybrid-sdk/client/connectionsManager/connectionHelpers';
import { WebSocketConnection } from '../../../../lib/hybrid-sdk/client/types/client';

describe('shutDownConnectionPair', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('clears both renewal timers, calls end+destroy on both, and splices both entries', () => {
    const primaryCallback = jest.fn();
    const secondaryCallback = jest.fn();

    const primaryTimer = setTimeout(primaryCallback, 30 * 60 * 1000);
    const secondaryTimer = setTimeout(secondaryCallback, 30 * 60 * 1000);

    const primary = {
      friendlyName: 'conn-A',
      timeoutHandlerId: primaryTimer,
      end: jest.fn(),
      destroy: jest.fn(),
    } as unknown as WebSocketConnection;

    const secondary = {
      friendlyName: 'conn-A',
      timeoutHandlerId: secondaryTimer,
      end: jest.fn(),
      destroy: jest.fn(),
    } as unknown as WebSocketConnection;

    const arr: WebSocketConnection[] = [primary, secondary];

    shutDownConnectionPair(arr, 0);

    // Both entries spliced out
    expect(arr).toHaveLength(0);

    // end and destroy called on primary
    expect(primary.end).toHaveBeenCalledTimes(1);
    expect(primary.destroy).toHaveBeenCalledTimes(1);

    // end and destroy called on secondary
    expect(secondary.end).toHaveBeenCalledTimes(1);
    expect(secondary.destroy).toHaveBeenCalledTimes(1);

    // Advancing past the renewal interval must NOT fire either callback
    jest.advanceTimersByTime(31 * 60 * 1000);
    expect(primaryCallback).not.toHaveBeenCalled();
    expect(secondaryCallback).not.toHaveBeenCalled();
  });

  it('does not throw when the sibling is already gone (single connection)', () => {
    const callback = jest.fn();
    const timer = setTimeout(callback, 30 * 60 * 1000);

    const only = {
      friendlyName: 'conn-A',
      timeoutHandlerId: timer,
      end: jest.fn(),
      destroy: jest.fn(),
    } as unknown as WebSocketConnection;

    const arr: WebSocketConnection[] = [only];

    expect(() => shutDownConnectionPair(arr, 0)).not.toThrow();
    expect(arr).toHaveLength(0);
    expect(only.end).toHaveBeenCalledTimes(1);
    expect(only.destroy).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(31 * 60 * 1000);
    expect(callback).not.toHaveBeenCalled();
  });

  it('does not throw when the connection index is out of range', () => {
    const arr: WebSocketConnection[] = [];
    expect(() => shutDownConnectionPair(arr, 0)).not.toThrow();
    expect(arr).toHaveLength(0);
  });
});
