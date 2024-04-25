export const handleTerminationSignal = (callback: () => void) => {
  process.on('SIGINT', () => {
    callback();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    callback();
    process.exit(0);
  });
};
