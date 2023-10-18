import { log as logger } from '../../logs/logger';
export const switchToInsecure = (url: string) => {
  logger.debug({ url }, 'Forcing insecure url');
  const urlToSwitch = new URL(url);
  urlToSwitch.protocol = 'http';
  return urlToSwitch.toString();
};
