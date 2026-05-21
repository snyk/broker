import { getWebsocketConnections } from '../../client';
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

const signalTerminationToServer = (signal) => {
  const [websocket] = getWebsocketConnections();
  if (websocket) {
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
