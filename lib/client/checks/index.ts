import logger = require('../../log');
import { Config } from '../config';
import { CheckStore } from './check-store';
import { CheckResult } from './types';
import { HttpCheckService } from './http/http-check-service';
import { PreflightCheckStore } from './prefilght-check-store';
import {
  createBrokerServerHealthcheck,
  createRestApiHealthcheck,
} from './http/http-checks';
import { retry } from '../retry/exponential-backoff';

export function preflightChecksEnabled(config: any): boolean {
  // preflight checks are enabled per default
  let preflightChecksEnabled = true;

  const preflightChecksEnabledValue = (config as Config)
    .PREFLIGHT_CHECKS_ENABLED;
  if (typeof preflightChecksEnabledValue !== 'undefined') {
    preflightChecksEnabled =
      preflightChecksEnabledValue.toLowerCase() === 'true' ||
      preflightChecksEnabledValue.toLowerCase() === 'yes';
  }

  logger.info(
    { enabled: preflightChecksEnabled },
    'verifying if preflight checks are enabled',
  );

  return preflightChecksEnabled;
}

export async function executePreflightChecks(
  config: any,
): Promise<CheckResult[]> {
  const preflightCheckResults: CheckResult[] = [];
  const { preflightCheckStore, httpCheckService } = await checksConfig(config);
  const checks = await preflightCheckStore.getAll();
  for (const check of checks) {
    const checkResult: CheckResult = await retry<CheckResult>(
      () => httpCheckService.run(check.checkId),
      {
        retries: 30,
        operation: `http check ${check.checkId}`,
      },
    );
    preflightCheckResults.push(checkResult);
  }
  return Promise.resolve(preflightCheckResults);
}

const configurePreflightCheckStore = async (
  config: Config,
): Promise<PreflightCheckStore> => {
  const preflightCheckStore = new PreflightCheckStore();

  await preflightCheckStore.add(createBrokerServerHealthcheck(config));
  await preflightCheckStore.add(createRestApiHealthcheck(config));

  return Promise.resolve(preflightCheckStore);
};

const configureHttpCheckService = async (
  checkStore: CheckStore,
): Promise<HttpCheckService> => {
  const httpCheckService = new HttpCheckService(checkStore);

  return Promise.resolve(httpCheckService);
};

// wire all dependencies (services and stores) here
const checksConfig = async (config: any) => {
  const preflightCheckStore = await configurePreflightCheckStore(
    config as Config,
  );

  const httpCheckService = await configureHttpCheckService(preflightCheckStore);

  return {
    preflightCheckStore,
    httpCheckService,
  };
};
