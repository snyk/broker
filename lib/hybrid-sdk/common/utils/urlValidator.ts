import { log as logger } from '../../../logs/logger';

/**
 * Returns `true` if URL contains a requested protocol, otherwise `false`.
 * @param url url to check
 * @param protocol protocol to compare
 */
export function urlContainsProtocol(url: string, protocol: string): boolean {
  try {
    const givenUrl = new URL(url);
    return givenUrl.protocol === protocol;
  } catch (error) {
    // Parse failure is the answer the caller wants (returns false); not an
    // operator-actionable failure. Keep at DEBUG for triage without spamming.
    logger.debug({ error, url }, 'Error parsing url');
    return false;
  }
}

export function isHttpUrl(brokerClientUrl: string): boolean {
  logger.trace(
    { url: brokerClientUrl },
    'checking if URL is correctly configured',
  );
  try {
    return (
      urlContainsProtocol(brokerClientUrl, 'http:') ||
      urlContainsProtocol(brokerClientUrl, 'https:')
    );
  } catch (error) {
    logger.debug(
      { error, url: brokerClientUrl },
      'Error checking URL HTTP protocol',
    );
    return false;
  }
}
