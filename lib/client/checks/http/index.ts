import { executeHttpRequest } from './http-executor';
import type { CheckResult, HttpCheck } from '../types';
import type { Config } from '../../types/config';

const defaultTimeoutMs = 5_000;

export function getHttpChecks(config: Config): HttpCheck[] {
  return [brokerServerStatusCheck(config), restApiStatusCheck(config)];
}

const brokerServerStatusCheck = (config: Config): HttpCheck => {
  const url = config.BROKER_SERVER_URL || 'https://broker.snyk.io';
  return {
    id: 'broker-server-status',
    name: 'Broker Server Healthcheck',
    enabled: true,

    url: `${url}/healthcheck`,
    method: 'GET',
    timeoutMs: defaultTimeoutMs,
    check: async function (): Promise<CheckResult> {
      return await executeHttpRequest(
        { id: this.id, name: this.name },
        { url: this.url, method: this.method, timeoutMs: this.timeoutMs },
      );
    },
  } satisfies HttpCheck;
};

const restApiStatusCheck = (config: Config): HttpCheck => {
  return {
    id: 'rest-api-status',
    name: 'REST API Healthcheck',
    enabled: true,

    url: `${config.API_BASE_URL}/rest/openapi`,
    method: 'GET',
    timeoutMs: defaultTimeoutMs,
    check: async function (): Promise<CheckResult> {
      return await executeHttpRequest(
        { id: this.id, name: this.name },
        { url: this.url, method: this.method, timeoutMs: this.timeoutMs },
      );
    },
  } satisfies HttpCheck;
};
