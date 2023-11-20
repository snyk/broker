import { log as logger } from '../../../logs/logger';
import type { CheckOptions, CheckResult } from '../types';
import type { Config } from '../../types/config';
import { urlContainsProtocol } from '../../../common/utils/urlValidator';

export function validateBrokerClientUrl(
  checkOptions: CheckOptions,
  config: Config,
): CheckResult {
  logger.debug({ checkId: checkOptions.id }, 'executing config check');

  const brokerClientUrl = config.BROKER_CLIENT_URL;
  try {
    if (brokerClientUrl && !isHttpUrl(brokerClientUrl)) {
      return {
        id: checkOptions.id,
        name: checkOptions.name,
        status: 'error',
        output: `Broker Client URL must use the HTTP or HTTPS protocols. Configured URL: ${brokerClientUrl}`,
      } satisfies CheckResult;
    }

    if (isHttpsWithoutCertificates(config)) {
      return {
        id: checkOptions.id,
        name: checkOptions.name,
        status: 'error',
        output: `Broker Client URL uses the HTTPS protocol: ${brokerClientUrl}, but HTTPS_CERT and HTTPS_KEY environment variables are missing.`,
      } satisfies CheckResult;
    }

    if (brokerClientUrl && isHostnameLocalhost(brokerClientUrl)) {
      return {
        id: checkOptions.id,
        name: checkOptions.name,
        status: 'warning',
        output: `Broker Client URL is configured for localhost: ${brokerClientUrl}. Webhooks might not work`,
      } satisfies CheckResult;
    }

    return {
      id: checkOptions.id,
      name: checkOptions.name,
      status: 'passing',
      output: 'config check: ok',
    } satisfies CheckResult;
  } catch (error) {
    const errorMessage = `Error executing check with checkId ${checkOptions.id}`;
    logger.debug({ error }, errorMessage);
    throw new Error(errorMessage);
  }
}

function isHttpUrl(brokerClientUrl: string): boolean {
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
    logger.error({ error }, 'Error checking URL HTTP protocol');
    return false;
  }
}

function isHttpsWithoutCertificates(config: Config): boolean {
  const brokerClientUrl = config.BROKER_CLIENT_URL;
  logger.trace(
    { url: brokerClientUrl },
    'checking if HTTPS is correctly configured',
  );

  try {
    if (brokerClientUrl && urlContainsProtocol(brokerClientUrl, 'https:')) {
      const httpsCert = config.HTTPS_CERT || '';
      const httpsKey = config.HTTPS_KEY || '';
      logger.debug(
        { httpsCert: httpsCert, httpsKey: httpsKey },
        'configured HTTPS certificate and key',
      );
      return httpsCert.length === 0 || httpsKey.length === 0;
    }
    return false;
  } catch (error) {
    logger.error({ error }, 'Error checking URL for HTTPS server');
    return false;
  }
}

function isHostnameLocalhost(brokerClientUrl: string): boolean {
  logger.trace({ url: brokerClientUrl }, 'checking if localhost is used');

  try {
    const givenURL = new URL(brokerClientUrl);
    return givenURL.hostname === 'localhost';
  } catch (error) {
    logger.error({ error }, 'Error checking URL for using localhost');
    return false;
  }
}
