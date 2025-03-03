import { getWebsocketConnections } from '../../client';
import { log as logger } from '../../../logs/logger';

const timers: NodeJS.Timeout[] = [];
const GRACE_PERIOD_MS = 12000;
export const handleTerminationSignal = (callback: () => void) => {
  process.on('SIGINT', () => {
    timers.forEach((timer) => clearInterval(timer));
    callback();
    signalTerminationToServer('SIGINT');
    setTimeout(() => {
      process.exit(0);
    }, GRACE_PERIOD_MS);
  });

  process.on('SIGTERM', async () => {
    timers.forEach((timer) => clearInterval(timer));
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
