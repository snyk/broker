import { log as logger } from '../../logs/logger';

export const handleIoError = (error) => {
  logger.error({ error }, 'Primus/engine.io server error');
};

export const handleSocketError = (error) => {
  logger.warn({ error }, 'error on websocket connection');
};
