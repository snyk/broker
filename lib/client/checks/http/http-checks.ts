import { Config } from '../../config';
import type { Check } from '../types';
import { highAvailabilityModeEnabled } from '../../dispatcher';

const defaultBrokerServerUrl = 'https://broker.snyk.io';
const defaultApiBaseUrl = 'https://api.snyk.io';
const defaultTimeoutMs = 10_000;

export function createBrokerServerHealthcheck(config: Config): Check {
  const url = config.BROKER_SERVER_URL || defaultBrokerServerUrl;
  return {
    checkId: 'broker-server-status',
    checkName: 'Broker Server Healthcheck',
    active: true,
    url: `${url}/healthcheck`,
    timeoutMs: defaultTimeoutMs,
  };
}

export function createRestApiHealthcheck(config: Config): Check {
  const url = config.API_BASE_URL || defaultApiBaseUrl;

  // check is enabled only for high availability mode
  const enabled = highAvailabilityModeEnabled(config);

  return {
    checkId: 'rest-api-status',
    checkName: 'REST API Healthcheck',
    active: enabled,
    url: `${url}/rest/openapi`,
    timeoutMs: defaultTimeoutMs,
  };
}
