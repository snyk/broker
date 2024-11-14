import { log as logger } from '../../logs/logger';

export const notificationHandler = ({ level, message }) => {
  switch (level) {
    case 'error':
      logger.error({ message });
      break;
    case 'warning':
      logger.warn({ message });
      break;
    case 'info':
    default:
      logger.info({ message });
  }
};
