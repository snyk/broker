import type { Config } from '../../types/config';
import type { Check, CheckResult } from '../types';
import { validateBrokerClientUrl } from './brokerClientUrlCheck';
import { validateAcceptFlagsConfig } from './customAcceptFile';
import { validateCodeAgentDeprecation } from './codeAgentDeprecation';
import { validateUniversalConnectionsConfig } from './universalConnectionConfigCheck';
import { validateBrokerClientVersionAgainstServer } from './brokerClientVersionCheck';

export function getConfigChecks(config: Config): Check[] {
  return [
    brokerClientUrlCheck(config),
    universalBrokerConnectionsCheck(config),
    acceptFlagsConfigurationCheck(config),
    codeAgentDeprecationCheck(config),
    brokerClientVersionCheck(config),
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
    id: 'local-universal-broker-connections-config-validation',
    name: 'Local Universal Broker Client Connections Configuration Check',
    enabled: config.universalBrokerEnabled && config.SKIP_REMOTE_CONFIG,
    check: function (): CheckResult {
      return validateUniversalConnectionsConfig(
        { id: this.id, name: this.name },
        config,
      );
    },
  } satisfies Check;
};

const acceptFlagsConfigurationCheck = (config: Config): Check => {
  return {
    id: 'accept-flags-config-validation',
    name: 'Accept flags Configuration Check',
    enabled: true,
    check: function (): CheckResult {
      return validateAcceptFlagsConfig(
        { id: this.id, name: this.name },
        config,
      );
    },
  } satisfies Check;
};

const codeAgentDeprecationCheck = (config: Config): Check => {
  return {
    id: 'code-agent-deprecation-validation',
    name: 'Code Agent Deprecation Check',
    enabled: !config.DISABLE_CODE_AGENT_PREFLIGHT_CHECK,
    check: function (): CheckResult {
      return validateCodeAgentDeprecation(
        { id: this.id, name: this.name },
        config,
      );
    },
  } satisfies Check;
};

const brokerClientVersionCheck = (config: Config): Check => {
  return {
    id: 'client-version-validation',
    name: 'Broker Client Version Check',
    enabled: true,
    check: async function (): Promise<CheckResult> {
      return await validateBrokerClientVersionAgainstServer(
        { id: this.id, name: this.name },
        config,
      );
    },
  } satisfies Check;
};
