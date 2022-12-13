import crypto = require('crypto');
import logger = require('../../log');
import { HAConfiguration } from './config';
import { HttpDispatcherServiceClient } from './client/api';
import { ServerId, getServerIdFromDispatcher } from './dispatcher-service';

const defaultBrokerDispatcherBaseUrl = 'https://api.snyk.io';

export function highAvailabilityModeEnabled(config: any): boolean {
  const haConfig = getHAConfig(config);

  logger.info(
    { enabled: haConfig.BROKER_HA_MODE_ENABLED },
    'checking for HA mode',
  );

  return haConfig.BROKER_HA_MODE_ENABLED;
}

export async function getServerId(
  config: any,
  brokerToken: string,
  brokerClientId: string,
): Promise<ServerId | null> {
  const haConfig = getHAConfig(config);
  const baseUrl =
    haConfig.BROKER_DISPATCHER_BASE_URL || defaultBrokerDispatcherBaseUrl;
  const client = new HttpDispatcherServiceClient(baseUrl);
  const token = hash(config.BROKER_TOKEN);

  const maxRetries = 30;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await getServerIdFromDispatcher(client, {
        brokerClientId: brokerClientId,
        hashedBrokerToken: token,
      });
    } catch (err) {
      const timeout = 2 ** attempt * 100;
      logger.warn(
        { attempt, timeout },
        `waiting for ${timeout}ms before next Broker Dispatcher API call`,
      );
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, timeout);
    }
  }

  return null;
}

function getHAConfig(config: any): HAConfiguration {
  return config as HAConfiguration;
}

function hash(token: string): string {
  const shasum = crypto.createHash('sha256');
  shasum.update(token);
  return shasum.digest('hex');
}
