import { LoadedClientOpts } from '../../common/types/options';
import { log as logger } from '../../../logs/logger';
import { WebSocketConnection } from '../types/client';
import { Client } from '../metrics/client';

export const reportWebSocketClosureEvent = (
  websocket: WebSocketConnection,
  clientOps: LoadedClientOpts,
  identifyingMetadata,
  metricsClient: Client,
  reason: string,
) => {
  // default duration of -1 so that it is obvious if this misbehaves
  let durationMs = -1;
  if (websocket.connectionStartTime) {
    durationMs = Date.now() - websocket.connectionStartTime;
  }

  metricsClient.recordWebsocketLifecycleEvent(
    reason,
    identifyingMetadata.role,
  );

  logger.warn(
    {
      url: clientOps.config.brokerServerUrl,
      token: clientOps.config.universalBrokerEnabled
        ? identifyingMetadata.integrationId
        : clientOps.config.brokerToken,
      reason,
      durationMs,
    },
    `Websocket connection event: ${reason}`,
  );

  if (durationMs >= 0) {
    metricsClient.recordConnectionDuration(
      identifyingMetadata.role,
      durationMs / 1000,
    );
  }
};
