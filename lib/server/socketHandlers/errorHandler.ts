import { log as logger } from '../../logs/logger';

export const handleSocketError = (error) => {
  logger.error({ error }, 'Primus/engine.io server error');
};
