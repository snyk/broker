import { getConfig } from '../../common/config/config';
import { getSocketConnections } from '../socket';
import { log as logger } from '../../../logs/logger';
import { Client } from '../metrics/client';
import { NoopClient } from '../metrics/noopClient';

const ONE_HOUR_FIVE_MIN_IN_MS = 65 * 60 * 1000;
const STALE_CONNECTIONS_CLEANUP_FREQUENCY =
  getConfig().STALE_CONNECTIONS_CLEANUP_FREQUENCY ?? ONE_HOUR_FIVE_MIN_IN_MS;

export const disconnectConnectionsWithStaleCreds = async (
  metricsClient: Client = new NoopClient(),
) => {
  const start = process.hrtime.bigint();
  try {
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
            'Disconnecting connection due to stale auth.',
          );
          client.socket?.end();
          metricsClient.incrementStaleCredsDisconnected();
        }
      });
    }
  } finally {
    const durationSeconds =
      Number(process.hrtime.bigint() - start) / 1_000_000_000;
    metricsClient.observeStaleCredsSweepDuration(durationSeconds);
    // Flush eagerly rather than waiting for the periodic exporter tick: a sweep
    // long enough to matter here is also long enough to precede a forced
    // (non-graceful) restart, which gives the periodic exporter no chance to run.
    metricsClient.forceFlush().catch((err) => {
      logger.warn({ err }, 'Failed to flush stale-creds watchdog metrics.');
    });
  }
};

const isDateWithinAnHourAndFiveSec = (date: string): boolean => {
  const dateInMs = new Date(date); // Convert ISO string to Date
  const now = Date.now(); // Get current time in milliseconds
  return now - dateInMs.getTime() < STALE_CONNECTIONS_CLEANUP_FREQUENCY;
};
