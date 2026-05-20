import { log as logger } from '../../../../logs/logger';
import type { CheckOptions, CheckResult } from '../types';
import type { Config } from '../../types/config';
import {
  urlContainsProtocol,
  isHttpUrl,
} from '../../../common/utils/urlValidator';
import {
  HttpResponse,
  makeSingleRawRequestToDownstream,
} from '../../../http/request';
import { retry } from '../../retry/exponential-backoff';

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

    if (isHttpsWithoutCertificates(config)) {
      const tls = await checkTLSTermination(config);
      if (!tls.terminated) {
        return {
          id: checkOptions.id,
          name: checkOptions.name,
          status: 'error',
          output:
            `Broker Client URL uses the HTTPS protocol: ${brokerClientUrl}, ` +
            `but the broker could not verify how TLS is being terminated. ` +
            `Probe to ${brokerClientUrl}/healthcheck failed: ${tls.probeError}. ` +
            `Either configure HTTPS_CERT and HTTPS_KEY so the broker terminates TLS itself, ` +
            `or set BROKER_CLIENT_URL_TLS_TERMINATED=true if TLS is already terminated upstream ` +
            `(e.g. behind a reverse proxy).`,
        } satisfies CheckResult;
      }
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
    if (error instanceof Error) {
      error.message = `Error executing check with checkId ${checkOptions.id}: ${error.message}`;
      throw error;
    }
    throw new Error(
      `Error executing check with checkId ${checkOptions.id}: ${String(error)}`,
      { cause: error },
    );
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

type TLSTerminationCheck =
  | { terminated: true }
  | { terminated: false; probeError: string };

async function checkTLSTermination(
  config: Config,
): Promise<TLSTerminationCheck> {
  if (config.BROKER_CLIENT_URL_TLS_TERMINATED) {
    return { terminated: true };
  }
  const request = {
    url: `${config.BROKER_CLIENT_URL}/healthcheck`,
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  };
  try {
    const response: HttpResponse = await retry<HttpResponse>(
      () => makeSingleRawRequestToDownstream(request),
      { retries: 3, operation: 'config check broker-client-url-validation' },
    );
    logger.trace({ response: response }, 'config check raw response data');
    return { terminated: true };
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    logger.warn(
      { err, url: request.url },
      `Failed to reach the BROKER_CLIENT_URL during TLS-termination probe: ${cause}.`,
    );
    return { terminated: false, probeError: cause };
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
