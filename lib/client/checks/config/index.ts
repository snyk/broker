import type { Config } from '../../types/config';
import type { Check, CheckResult } from '../types';
import { validateBrokerClientUrl } from './brokerClientUrlCheck';
import { validateUniversalConnectionsConfig } from './universalConnectionConfigCheck';

export function getConfigChecks(config: Config): Check[] {
  return [
    brokerClientUrlCheck(config),
    universalBrokerConnectionsCheck(config),
  ];
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

const universalBrokerConnectionsCheck = (config: Config): Check => {
  return {
    id: 'universal-broker-connections-config-validation',
    name: 'Universal Broker Client Connections Configuration Check',
    enabled: config.universalBrokerEnabled,
    check: function (): CheckResult {
      return validateUniversalConnectionsConfig(
        { id: this.id, name: this.name },
        config,
      );
    },
  } satisfies Check;
};
