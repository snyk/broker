import { LoadedClientOpts } from '../../common/types/options';
import { log as logger } from '../../../logs/logger';
import { WebSocketConnection } from '../types/client';

export const closeHandler = (
  websocket: WebSocketConnection,
  clientOps: LoadedClientOpts,
  identifyingMetadata,
) => {
  // default duration of -1 so that it is obvious if this misbehaves
  let durationMs = -1;
  if (websocket.connectionStartTime) {
    durationMs = Date.now() - websocket.connectionStartTime;
  }
  logger.warn(
    {
      url: clientOps.config.brokerServerUrl,
      token: clientOps.config.universalBrokerEnabled
        ? identifyingMetadata.integrationId
        : clientOps.config.brokerToken,
      durationMs,
    },
    'Websocket connection to the broker server was closed.',
  );
};
