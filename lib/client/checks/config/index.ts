import type { Config } from '../../types/config';
import type { Check, CheckResult } from '../types';
import { validateBrokerClientUrl } from './brokerClientUrlCheck';

export function getConfigChecks(config: Config): Check[] {
  return [brokerClientUrlCheck(config)];
}

const brokerClientUrlCheck = (config: Config): Check => {
  const url = config.BROKER_CLIENT_URL;
  return {
    id: 'broker-client-url-validation',
    name: 'Broker Client URL Validation Check',
    enabled: url != undefined && url.length > 0,
    check: async function (): Promise<CheckResult> {
      return await validateBrokerClientUrl(
        { id: this.id, name: this.name },
        config,
      );
    },
  } satisfies Check;
};
