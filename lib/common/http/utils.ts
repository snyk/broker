import { log as logger } from '../../logs/logger';
export const switchToInsecure = (url: string) => {
  const urlToSwitch = new URL(url);
  if (!urlToSwitch.hostname.includes('.snyk.io')) {
    logger.debug({ url }, 'Forcing insecure url');
    urlToSwitch.protocol = 'http';
  }

  return urlToSwitch.toString();
};
