import { log as logger } from '../../logs/logger';
import { getHttpChecks } from './http';
import type { Config } from '../types/config';
import type { Check, CheckResult } from './types';

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
  const preflightChecks: Check[] = [];
  const httpChecks = getHttpChecks(config as Config).filter((c) => c.enabled);
  preflightChecks.push(...httpChecks);

  const preflightCheckResults: CheckResult[] = [];
  const results = await Promise.allSettled(
    preflightChecks.map(async (c) => c.check(config)),
  );
  results.forEach((r) => {
    if (r.status === 'fulfilled') {
      preflightCheckResults.push(r.value);
    } else {
      logger.error(
        { error: r.reason },
        'Unexpected error when executing checks',
      );
    }
  });

  logPreflightCheckResults(preflightCheckResults);

  return Promise.resolve(preflightCheckResults);
}

const logPreflightCheckResults = (results: CheckResult[]) => {
  console.log('##############################################################');
  console.log('### PREFLIGHT CHECKS RESULTS');
  console.log('###');
  console.log('### Preflight checks help to catch errors early, upon broker');
  console.log('### client startup. Note, that broker client will start');
  console.log('### whether the checks were successful or not.');
  console.log('###');
  console.log('### See more: https://github.com/snyk/broker#preflight-checks');
  console.log('##############################################################');

  const checks = results.map((check) => {
    return { id: check.id, status: check.status };
  });
  console.table(checks);
};
