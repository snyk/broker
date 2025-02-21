import { log as logger } from '../../../logs/logger';

export const errorHandler = ({ type, description }) => {
  if (type === 'TransportError') {
    logger.error({ type, description }, 'Failed to connect to broker server.');
  } else {
    logger.warn({ type, description }, 'Error on websocket connection.');
  }
};
