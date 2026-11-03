import { hashToken } from './token';

export const craConnectionQueryParameter = 'snyk-broker-connection';

export const getCraConnections = (config: Record<string, any>) =>
  (Object.values(config.connections ?? {}) as Record<string, any>[]).filter(
    (connection) => config.CRA_COMPATIBLE_TYPES?.includes(connection?.type),
  );

export const scopeCraCallbackUrl = (
  callbackUrl: string,
  identifier: string,
  config: Record<string, any>,
): string => {
  const connections = getCraConnections(config);
  if (
    connections.length < 2 ||
    !connections.some((connection) => connection.identifier === identifier)
  ) {
    return callbackUrl;
  }
  const fragmentIndex = callbackUrl.indexOf('#');
  const baseUrl =
    fragmentIndex === -1 ? callbackUrl : callbackUrl.slice(0, fragmentIndex);
  const fragment = fragmentIndex === -1 ? '' : callbackUrl.slice(fragmentIndex);
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}${craConnectionQueryParameter}=${hashToken(
    identifier,
  )}${fragment}`;
};
