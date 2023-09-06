import { log as logger } from '../../logs/logger';
import { ClientOpts } from '../types/client';

export const closeHandler = (clientOps: ClientOpts) => {
  logger.warn(
    {
      url: clientOps.config.brokerServerUrl,
      token: clientOps.config.brokerToken,
    },
    'websocket connection to the broker server was closed',
  );
};
