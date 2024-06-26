const timers: NodeJS.Timeout[] = [];

export const handleTerminationSignal = (callback: () => void) => {
  process.on('SIGINT', () => {
    timers.forEach((timer) => clearInterval(timer));
    callback();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    timers.forEach((timer) => clearInterval(timer));
    callback();
    process.exit(0);
  });
};

export const addTimerToTerminalHandlers = (timerId: NodeJS.Timeout) => {
  timers.push(timerId);
};
