import { log as logger } from '../../../../logs/logger';
import type { CheckOptions, CheckResult } from '../types';
import type { Config } from '../../types/config';
import { isHttpUrl } from '../../../common/utils/urlValidator';

export async function validateBrokerServerUrl(
  checkOptions: CheckOptions,
  config: Config,
): Promise<CheckResult> {
  logger.debug({ checkId: checkOptions.id }, 'executing config check');
  const brokerServerUrl = config.BROKER_SERVER_URL;
  try {
    if (brokerServerUrl && !isHttpUrl(brokerServerUrl)) {
      return {
        id: checkOptions.id,
        name: checkOptions.name,
        status: 'error',
        output: `Broker Server URL must use the HTTP or HTTPS protocols. Configured URL: ${brokerServerUrl}`,
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
