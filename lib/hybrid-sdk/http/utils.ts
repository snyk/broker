import { Role } from '../client/types/client';
import { log as logger } from '../../logs/logger';
export const switchToInsecure = (url: string) => {
  const urlToSwitch = new URL(url);
  if (!urlToSwitch.hostname.includes('.snyk.io')) {
    logger.debug({ url }, 'Forcing insecure url');
    urlToSwitch.protocol = 'http';
  }

  return urlToSwitch.toString();
};

export const addServerIdAndRoleQS = (
  url: URL,
  serverId: number,
  role: Role,
): URL => {
  const urlToAddQs = url;
  if (serverId && serverId > -1) {
    urlToAddQs.searchParams.append('server_id', `${serverId}`);
  }
  if (role) {
    urlToAddQs.searchParams.append('connection_role', role);
  }
  return urlToAddQs;
};
