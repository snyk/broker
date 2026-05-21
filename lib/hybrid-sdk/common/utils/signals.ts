import { getWebsocketConnections } from '../../client';
import { log as logger } from '../../../logs/logger';

const timers: NodeJS.Timeout[] = [];
const GRACE_PERIOD_MS = 12000;

let shuttingDown = false;
export const isShuttingDown = (): boolean => shuttingDown;

const clearAllTimers = () => {
  timers.forEach((timer) => clearTimeout(timer));
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

export const addTimerToTerminalHandlers = (timerId: NodeJS.Timeout) => {
  timers.push(timerId);
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
