import { log as logger } from '../../../logs/logger';
import { LoadedClientOpts } from '../../common/types/options';
import { WebSocketConnection, IdentifyingMetadata } from '../types/client';

export const createErrorHandler = (
  websocket: WebSocketConnection,
  clientOps: LoadedClientOpts,
  identifyingMetadata: IdentifyingMetadata,
) => {
  return ({ type, description }) => {
    const context = {
      type,
      description,
      connectionName: websocket.friendlyName || 'unknown',
      brokerServerUrl: clientOps.config.brokerServerUrl,
      serverId: websocket.serverId || 'none',
    };

    if (type === 'TransportError') {
      logger.warn(context, 'Failed to connect to broker server.');
    } else {
      logger.warn(context, 'Error on websocket connection.');
    }
  };
};

// Backwards compatibility: export a version that works with minimal context
export const errorHandler = ({ type, description }) => {
  if (type === 'TransportError') {
    logger.warn({ type, description }, 'Failed to connect to broker server.');
  } else {
    logger.warn({ type, description }, 'Error on websocket connection.');
  }
};
