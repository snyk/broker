import * as detectPort from 'detect-port';

const DEFAULT_PORT = 20000;

/**
 * Returns a guaranteed free port, that can be used by HTTP server.
 * @param port
 */
export const choosePort = async (port?: number): Promise<number> => {
  if (!port) {
    port = DEFAULT_PORT;
  }
  return Promise.resolve(detectPort(port));
};
