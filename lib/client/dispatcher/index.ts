import { log as logger } from '../../logs/logger';
import { hashToken } from '../../common/utils/token';
import { HttpDispatcherServiceClient } from './client/api';
import { ServerId, getServerIdFromDispatcher } from './dispatcher-service';

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
        config,
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
