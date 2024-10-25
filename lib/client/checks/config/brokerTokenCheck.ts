import { log as logger } from '../../../logs/logger';
import type { CheckOptions, CheckResult } from '../types';
import type { Config } from '../../types/config';
import { isUuid } from '../utils';

export async function validateBrokerToken(
  checkOptions: CheckOptions,
  config: Config,
): Promise<CheckResult> {
  logger.debug({ checkId: checkOptions.id }, 'executing config check');

  const brokerToken = config.BROKER_TOKEN;
  if (!brokerToken) {
    return {
      id: checkOptions.id,
      name: checkOptions.name,
      status: 'error',
      output: 'Broker Token is required',
    } satisfies CheckResult;
  }

  if (!isUuid(brokerToken)) {
    return {
      id: checkOptions.id,
      name: checkOptions.name,
      status: 'error',
      output:
        'Broker Token in unrecognised format. Ensure Broker Token is correct, and is of form UUIDv4',
    } satisfies CheckResult;
  }

  return {
    id: checkOptions.id,
    name: checkOptions.name,
    status: 'passing',
    output: 'Broker Token parsed successfully',
  } satisfies CheckResult;
}
