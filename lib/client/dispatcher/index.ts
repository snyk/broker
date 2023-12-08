import { log as logger } from '../../logs/logger';
import { Config } from '../types/config';
import { hashToken } from '../../common/utils/token';
import { HttpDispatcherServiceClient } from './client/api';
import { ServerId, getServerIdFromDispatcher } from './dispatcher-service';

export function highAvailabilityModeEnabled(config: any): boolean {
  // high availability mode is disabled per default
  let highAvailabilityModeEnabled = false;

  const highAvailabilityModeEnabledValue = (config as Config)
    .BROKER_HA_MODE_ENABLED;

  if (typeof highAvailabilityModeEnabledValue !== 'undefined') {
    highAvailabilityModeEnabled =
      highAvailabilityModeEnabledValue.toLowerCase() === 'true' ||
      highAvailabilityModeEnabledValue.toLowerCase() === 'yes';
  }

  logger.info({ enabled: highAvailabilityModeEnabled }, 'checking for HA mode');

  return highAvailabilityModeEnabled;
}

export async function getServerId(
  config: any,
  brokerToken: string,
  brokerClientId: string,
): Promise<ServerId | null> {
  if (!brokerToken) {
    logger.error({ token: brokerToken }, 'missing client token');
    const error = new Error(
      'BROKER_TOKEN is required to successfully identify itself to the server',
    );
    error.name = 'MISSING_BROKER_TOKEN';
    throw error;
  }

  const client = new HttpDispatcherServiceClient(config.API_BASE_URL);
  const hashedToken = hashToken(brokerToken);
  const maxRetries = 10;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await getServerIdFromDispatcher(
        client,
        {
          brokerClientId: brokerClientId,
          hashedBrokerToken: hashedToken,
        },
        {
          deployment_location: `${
            config.BROKER_CLIENT_LOCATION || 'snyk-broker-client'
          }`,
          broker_token_first_char: `${brokerToken[0]}`,
        },
      );
    } catch (err) {
      const timeout = 2 ** attempt * 30000;
      logger.warn(
        { attempt, timeout },
        `waiting for ${timeout}ms before next Broker Dispatcher API call`,
      );
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, timeout);
    }
  }

  return null;
}
