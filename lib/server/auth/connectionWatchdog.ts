import { getConfig } from '../../common/config/config';
import { getSocketConnections } from '../socket';
import { log as logger } from '../../logs/logger';

const ONE_HOUR_FIVE_MIN_IN_MS = 65 * 60 * 1000;
const STALE_CONNECTIONS_CLEANUP_FREQUENCY =
  getConfig().STALE_CONNECTIONS_CLEANUP_FREQUENCY ?? ONE_HOUR_FIVE_MIN_IN_MS;

export const disconnectConnectionsWithStaleCreds = async () => {
  const connections = getSocketConnections();
  const connectionsIterator = connections.entries();
  for (const [identifier, connection] of connectionsIterator) {
    connection.forEach((client) => {
      if (!isDateWithinAnHourAndFiveSec(client.credsValidationTime!)) {
        logger.info(
          {
            connection: `${identifier}`,
            credsLastValidated: client.credsValidationTime,
          },
          'Cutting off connection.',
        );
        client.socket?.end();
      }
    });
  }
};

const isDateWithinAnHourAndFiveSec = (date: string): boolean => {
  const dateInMs = new Date(date); // Convert ISO string to Date
  const now = Date.now(); // Get current time in milliseconds
  return now - dateInMs.getTime() < STALE_CONNECTIONS_CLEANUP_FREQUENCY;
};
