import * as detectPort from 'detect-port';

const DEFAULT_TEST_WEB_SERVER_PORT = 9000;

/**
 * Returns a guaranteed free port, that can be used by HTTP server.
 * @param port
 * @param defaultPort
 */
export const choosePort = async (
  port?: number,
  defaultPort: number = DEFAULT_TEST_WEB_SERVER_PORT,
): Promise<number> => {
  if (!port) {
    port = defaultPort;
  }
  return Promise.resolve(detectPort(port));
};
