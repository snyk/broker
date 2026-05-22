jest.mock('../../../../../../lib/hybrid-sdk/client', () => ({
  getWebsocketConnections: jest.fn(() => [{ send: jest.fn() }]),
}));

type SignalsModule =
  typeof import('../../../../../../lib/hybrid-sdk/common/utils/signals');

const loadSignals = (): SignalsModule => {
  let mod!: SignalsModule;
  jest.isolateModules(() => {
    mod = require('../../../../../../lib/hybrid-sdk/common/utils/signals');
  });
  return mod;
};

describe('signals', () => {
  const realListeners: { sigterm: any[]; sigint: any[] } = {
    sigterm: [],
    sigint: [],
  };
  let exitSpy: jest.SpyInstance;

  beforeEach(() => {
    realListeners.sigterm = process.listeners('SIGTERM');
    realListeners.sigint = process.listeners('SIGINT');
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
    jest.useFakeTimers();
    exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as any);
  });

  afterEach(() => {
    jest.useRealTimers();
    exitSpy.mockRestore();
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
    for (const l of realListeners.sigterm) process.on('SIGTERM', l);
    for (const l of realListeners.sigint) process.on('SIGINT', l);
  });

  describe('isShuttingDown', () => {
    it('is false on module load', () => {
      const signals = loadSignals();
      expect(signals.isShuttingDown()).toBe(false);
    });

    it('flips to true synchronously on SIGTERM', () => {
      const signals = loadSignals();
      signals.handleTerminationSignal(() => {});
      expect(signals.isShuttingDown()).toBe(false);
      process.emit('SIGTERM' as any);
      expect(signals.isShuttingDown()).toBe(true);
    });

    it('flips to true synchronously on SIGINT', () => {
      const signals = loadSignals();
      signals.handleTerminationSignal(() => {});
      expect(signals.isShuttingDown()).toBe(false);
      process.emit('SIGINT' as any);
      expect(signals.isShuttingDown()).toBe(true);
    });

    it('stays true after subsequent ticks; never resets within a process', async () => {
      const signals = loadSignals();
      signals.handleTerminationSignal(() => {});
      process.emit('SIGTERM' as any);
      expect(signals.isShuttingDown()).toBe(true);
      jest.advanceTimersByTime(60_000);
      expect(signals.isShuttingDown()).toBe(true);
    });

    it('is set BEFORE the user callback runs (first line of handler)', () => {
      const signals = loadSignals();
      let observedDuringCallback: boolean | null = null;
      signals.handleTerminationSignal(() => {
        observedDuringCallback = signals.isShuttingDown();
      });
      process.emit('SIGTERM' as any);
      expect(observedDuringCallback).toBe(true);
    });
  });

  describe('terminal handler registries', () => {
    it('clearAllTimers clears a registered setInterval on SIGTERM', () => {
      const signals = loadSignals();
      signals.handleTerminationSignal(() => {});
      const fn = jest.fn();
      const interval = setInterval(fn, 10);
      signals.addIntervalToTerminalHandlers(interval);

      process.emit('SIGTERM' as any);

      jest.advanceTimersByTime(100);
      expect(fn).not.toHaveBeenCalled();
    });

    it('clearAllTimers clears a registered setTimeout on SIGTERM', () => {
      const signals = loadSignals();
      signals.handleTerminationSignal(() => {});
      const fn = jest.fn();
      const timeout = setTimeout(fn, 50);
      signals.addTimeoutToTerminalHandlers(timeout);

      process.emit('SIGTERM' as any);

      jest.advanceTimersByTime(100);
      expect(fn).not.toHaveBeenCalled();
    });

    it('clearAllTimers clears both kinds together on SIGINT', () => {
      const signals = loadSignals();
      signals.handleTerminationSignal(() => {});
      const intervalFn = jest.fn();
      const timeoutFn = jest.fn();
      signals.addIntervalToTerminalHandlers(setInterval(intervalFn, 10));
      signals.addTimeoutToTerminalHandlers(setTimeout(timeoutFn, 50));

      process.emit('SIGINT' as any);

      jest.advanceTimersByTime(100);
      expect(intervalFn).not.toHaveBeenCalled();
      expect(timeoutFn).not.toHaveBeenCalled();
    });

    it('dispatches clearInterval (not clearTimeout) for registered intervals', () => {
      const signals = loadSignals();
      signals.handleTerminationSignal(() => {});
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
      const interval = setInterval(() => {}, 10);
      signals.addIntervalToTerminalHandlers(interval);

      process.emit('SIGTERM' as any);

      expect(clearIntervalSpy).toHaveBeenCalledWith(interval);
      expect(clearTimeoutSpy).not.toHaveBeenCalledWith(interval);
      clearIntervalSpy.mockRestore();
      clearTimeoutSpy.mockRestore();
    });

    it('dispatches clearTimeout (not clearInterval) for registered timeouts', () => {
      const signals = loadSignals();
      signals.handleTerminationSignal(() => {});
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
      const timeout = setTimeout(() => {}, 50);
      signals.addTimeoutToTerminalHandlers(timeout);

      process.emit('SIGTERM' as any);

      expect(clearTimeoutSpy).toHaveBeenCalledWith(timeout);
      expect(clearIntervalSpy).not.toHaveBeenCalledWith(timeout);
      clearIntervalSpy.mockRestore();
      clearTimeoutSpy.mockRestore();
    });
  });

  describe('clearAndRemoveInterval / clearAndRemoveTimeout', () => {
    it('clearAndRemoveInterval clears the timer and removes it from the registry so shutdown does not re-clear it', () => {
      const signals = loadSignals();
      signals.handleTerminationSignal(() => {});
      const fn = jest.fn();
      const interval = setInterval(fn, 10);
      signals.addIntervalToTerminalHandlers(interval);
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      signals.clearAndRemoveInterval(interval);
      expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
      expect(clearIntervalSpy).toHaveBeenCalledWith(interval);

      // Shutdown should not redundantly call clearInterval on the removed handle.
      process.emit('SIGTERM' as any);
      expect(clearIntervalSpy).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(100);
      expect(fn).not.toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });

    it('clearAndRemoveTimeout clears the timer and removes it from the registry so shutdown does not re-clear it', () => {
      const signals = loadSignals();
      signals.handleTerminationSignal(() => {});
      const fn = jest.fn();
      const timeout = setTimeout(fn, 50);
      signals.addTimeoutToTerminalHandlers(timeout);
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      signals.clearAndRemoveTimeout(timeout);
      expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
      expect(clearTimeoutSpy).toHaveBeenCalledWith(timeout);

      process.emit('SIGTERM' as any);
      expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(100);
      expect(fn).not.toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });

    it('repeated toggle does not grow the registry: shutdown clears only the currently-registered handle', () => {
      const signals = loadSignals();
      signals.handleTerminationSignal(() => {});
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      // Simulate three add/clear cycles followed by a final live registration.
      for (let i = 0; i < 3; i++) {
        const id = setInterval(() => {}, 10);
        signals.addIntervalToTerminalHandlers(id);
        signals.clearAndRemoveInterval(id);
      }
      const liveId = setInterval(() => {}, 10);
      signals.addIntervalToTerminalHandlers(liveId);

      clearIntervalSpy.mockClear();
      process.emit('SIGTERM' as any);

      // Only the live handle is in the registry; the three cleared ones are gone.
      expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
      expect(clearIntervalSpy).toHaveBeenCalledWith(liveId);
      clearIntervalSpy.mockRestore();
    });

    it('clearAndRemoveInterval is a no-op (no throw) on an unregistered handle', () => {
      const signals = loadSignals();
      signals.handleTerminationSignal(() => {});
      const stray = setInterval(() => {}, 10);
      const registered = setInterval(() => {}, 10);
      signals.addIntervalToTerminalHandlers(registered);
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      expect(() => signals.clearAndRemoveInterval(stray)).not.toThrow();
      // Stray handle gets cleared (defensive), but the registered one survives.
      expect(clearIntervalSpy).toHaveBeenCalledWith(stray);

      clearIntervalSpy.mockClear();
      process.emit('SIGTERM' as any);
      expect(clearIntervalSpy).toHaveBeenCalledWith(registered);
      clearIntervalSpy.mockRestore();
    });
  });
});
