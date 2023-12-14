import { log as logger } from '../../logs/logger';
import { getConfigChecks } from './config';
import { getHttpChecks } from './http';
import type { Config } from '../types/config';
import type { Check, CheckResult } from './types';
import { splitStringIntoLines } from './utils';

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
  const configChecks = getConfigChecks(config as Config).filter(
    (c) => c.enabled,
  );
  preflightChecks.push(...configChecks);

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
  console.log('\n\n');
  console.log('##############################################################');
  console.log('### PREFLIGHT CHECKS RESULTS - NON BLOCKING');
  console.log('###');
  console.log('### Preflight checks help to catch errors early, upon broker');
  console.log('### client startup. Note, that broker client will start');
  console.log('### whether the checks were successful or not.');
  console.log('###');
  console.log('##############################################################');
  console.log('\n');
  const nonPassingChecksDetails: string[] = [
    `#############################################################################################
### PREFLIGHT CHECKS DETAILS
###
### ${splitStringIntoLines(
      `Get help at https://snyk.io/broker-checks`,
      88,
      '### ',
    )}
###`,
  ];
  const checks = results.map((check) => {
    if (check.status != 'passing') {
      nonPassingChecksDetails.push(`
### [${check.name}] ${check.status}.
### Preflight Check output:
### ${splitStringIntoLines(check.output, 88, '### ')}
### Help: https://snyk.io/broker-checks?${check.id}
###`);
    }
    return { id: check.id, status: check.status };
  });
  nonPassingChecksDetails.push(
    '##########################################################################################',
  );
  console.log('### Preflight checks summary');
  console.table(checks);
  console.log('\n');
  if (checks.some((x) => x.status != 'passing')) {
    console.log(nonPassingChecksDetails.join('\n###'));
  } else {
    console.log(
      '#############################################################################################',
    );
    console.log('### All Preflight checks passing');
    console.log(
      '#############################################################################################',
    );
  }
  console.log('\n');
};
