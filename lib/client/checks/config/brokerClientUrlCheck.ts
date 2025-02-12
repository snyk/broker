import { log as logger } from '../../../logs/logger';
import type { CheckOptions, CheckResult } from '../types';
import type { Config } from '../../types/config';
import {
  urlContainsProtocol,
  isHttpUrl,
} from '../../../common/utils/urlValidator';
import {
  HttpResponse,
  makeSingleRawRequestToDownstream,
} from '../../../hybrid-sdk/http/request';
import { retry } from '../../retry/exponential-backoff';
import version from '../../../common/utils/version';

export async function validateBrokerClientUrl(
  checkOptions: CheckOptions,
  config: Config,
): Promise<CheckResult> {
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

    if (
      isHttpsWithoutCertificates(config) &&
      !(await isBrokerClientUrlTLSTerminated(config))
    ) {
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

async function isBrokerClientUrlTLSTerminated(
  config: Config,
): Promise<boolean> {
  let isTLSTerminated = false;
  if (config.BROKER_CLIENT_URL_TLS_TERMINATED) {
    isTLSTerminated = true;
  } else {
    const request = {
      url: `${config.BROKER_CLIENT_URL}/healthcheck`,
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': `broker client/${version} (config check service)`,
      },
    };
    try {
      const response: HttpResponse = await retry<HttpResponse>(
        () => makeSingleRawRequestToDownstream(request),
        { retries: 3, operation: 'config check broker-client-url-validation' },
      );
      logger.trace({ response: response }, 'config check raw response data');
      isTLSTerminated = true;
    } catch (err) {
      logger.debug(
        { err },
        'Failed to reach the BROKER_CLIENT_URL from the broker client.',
      );
      isTLSTerminated = false;
    }
  }

  return isTLSTerminated;
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
