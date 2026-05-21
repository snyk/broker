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

  describe('addTimerToTerminalHandlers', () => {
    it('clears a registered setInterval on SIGTERM', () => {
      const signals = loadSignals();
      signals.handleTerminationSignal(() => {});
      const fn = jest.fn();
      const interval = setInterval(fn, 10);
      signals.addTimerToTerminalHandlers(interval);

      process.emit('SIGTERM' as any);

      jest.advanceTimersByTime(100);
      expect(fn).not.toHaveBeenCalled();
    });

    it('clears a registered setTimeout on SIGTERM', () => {
      const signals = loadSignals();
      signals.handleTerminationSignal(() => {});
      const fn = jest.fn();
      const timeout = setTimeout(fn, 50);
      signals.addTimerToTerminalHandlers(timeout);

      process.emit('SIGTERM' as any);

      jest.advanceTimersByTime(100);
      expect(fn).not.toHaveBeenCalled();
    });

    it('clears both setTimeout and setInterval on SIGINT', () => {
      const signals = loadSignals();
      signals.handleTerminationSignal(() => {});
      const intervalFn = jest.fn();
      const timeoutFn = jest.fn();
      signals.addTimerToTerminalHandlers(setInterval(intervalFn, 10));
      signals.addTimerToTerminalHandlers(setTimeout(timeoutFn, 50));

      process.emit('SIGINT' as any);

      jest.advanceTimersByTime(100);
      expect(intervalFn).not.toHaveBeenCalled();
      expect(timeoutFn).not.toHaveBeenCalled();
    });
  });
});
