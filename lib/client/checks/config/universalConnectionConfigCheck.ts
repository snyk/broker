import { getConfigForIdentifier } from '../../../common/config/universal';
import { Config } from '../../types/config';
import { CheckOptions, CheckResult } from '../types';

export const validateUniversalConnectionsConfig = (
  checkOptions: CheckOptions,
  config: Config,
): CheckResult => {
  if (!config.connections) {
    return {
      id: checkOptions.id,
      name: checkOptions.name,
      status: 'error',
      output: `Missing connections in config`,
    } satisfies CheckResult;
  }
  for (const key in config.connections) {
    const currentConnection = getConfigForIdentifier(
      config.connections[key].identifier,
      config,
    );
    if (!currentConnection || !currentConnection.type) {
      return {
        id: checkOptions.id,
        name: checkOptions.name,
        status: 'error',
        output: `Missing type in connection ${key} is unsupported`,
      } satisfies CheckResult;
    }
    if (!config.supportedBrokerTypes.includes(currentConnection.type)) {
      return {
        id: checkOptions.id,
        name: checkOptions.name,
        status: 'error',
        output: `${currentConnection.type} type in connection ${key} is unsupported`,
      } satisfies CheckResult;
    }

    // Check all required elements are there
    for (const requiredKey in config.brokerClientConfiguration[
      currentConnection.type
    ].required) {
      if (
        requiredKey != 'type' &&
        !Object.keys(currentConnection).includes(requiredKey)
      ) {
        return {
          id: checkOptions.id,
          name: checkOptions.name,
          status: 'error',
          output: `Missing ${requiredKey} required in connection ${key}`,
        } satisfies CheckResult;
      }
    }
  }

  return {
    id: checkOptions.id,
    name: checkOptions.name,
    status: 'passing',
    output: 'connections config check: ok',
  } satisfies CheckResult;
};
