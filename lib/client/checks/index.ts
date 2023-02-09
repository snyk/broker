import logger = require('../../log');
import { Config } from '../config';
import { PreflightCheckStore } from './prefilght-check-store';
import {
  createBrokerServerHealthcheck,
  createRestApiHealthcheck,
} from './http/http-checks';
import { HttpCheckService } from './http/http-check-service';
import { CheckStore } from './check-store';

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

export const checkConfig = async (config: any) => {
  const preflightCheckStore = await configurePreflightCheckStore(
    config as Config,
  );

  const httpCheckService = await configureHttpCheckService(preflightCheckStore);

  return {
    preflightCheckStore,
    httpCheckService,
  };
};
