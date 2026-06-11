import { getWebsocketConnections } from '../../client';
import { emitShutdown } from '../../client/events';
import { log as logger } from '../../../logs/logger';

const intervals: NodeJS.Timeout[] = [];
const timeouts: NodeJS.Timeout[] = [];
const GRACE_PERIOD_MS = 12000;

let shuttingDown = false;
export const isShuttingDown = (): boolean => shuttingDown;

const clearAllTimers = () => {
  intervals.forEach((id) => clearInterval(id));
  timeouts.forEach((id) => clearTimeout(id));
};

export const handleTerminationSignal = (callback: () => void) => {
  process.on('SIGINT', () => {
    shuttingDown = true;
    clearAllTimers();
    callback();
    signalTerminationToServer('SIGINT');
    setTimeout(() => {
      process.exit(0);
    }, GRACE_PERIOD_MS);
  });

  process.on('SIGTERM', async () => {
    shuttingDown = true;
    clearAllTimers();
    callback();
    signalTerminationToServer('SIGTERM');
    setTimeout(() => {
      process.exit(0);
    }, GRACE_PERIOD_MS);
  });
};

export const addIntervalToTerminalHandlers = (intervalId: NodeJS.Timeout) => {
  intervals.push(intervalId);
};

export const addTimeoutToTerminalHandlers = (timeoutId: NodeJS.Timeout) => {
  timeouts.push(timeoutId);
};

/** Clear an interval and remove its handle from the registry. Paired so
 *  callers can't clear-without-remove, which previously caused the registry
 *  to grow with dead references whenever a timer was toggled at runtime. */
export const clearAndRemoveInterval = (intervalId: NodeJS.Timeout) => {
  clearInterval(intervalId);
  const i = intervals.indexOf(intervalId);
  if (i !== -1) {
    intervals.splice(i, 1);
  }
};

/** Clear a timeout and remove its handle from the registry. */
export const clearAndRemoveTimeout = (timeoutId: NodeJS.Timeout) => {
  clearTimeout(timeoutId);
  const i = timeouts.indexOf(timeoutId);
  if (i !== -1) {
    timeouts.splice(i, 1);
  }
};

const signalTerminationToServer = (signal) => {
  const [websocket] = getWebsocketConnections();
  if (websocket) {
    emitShutdown({
      reason: 'clean',
      uptimeSeconds: Math.round(process.uptime()),
    });
    websocket.send('terminate', {
      signal,
    });
  } else {
    logger.error(
      {},
      'Unable to find websocket to signal termination to server.',
    );
  }
};
