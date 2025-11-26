import { log as logger } from '../../../logs/logger';

export const handleIoError = (error: unknown) => {
  logger.error({ error }, 'Primus/engine.io server error');
};

export const handleSocketError = (error: unknown) => {
  logger.warn({ error }, 'Error on websocket connection.');
};
