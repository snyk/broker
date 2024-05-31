import { Config } from '../../types/config';
import { CheckOptions, CheckResult } from '../types';

export const validateCodeAgentDeprecation = (
  checkOptions: CheckOptions,
  config: Config,
): CheckResult => {
  if (config.GIT_CLIENT_URL && !config.DISABLE_CODE_AGENT_PREFLIGHT_CHECK) {
    return {
      id: checkOptions.id,
      name: checkOptions.name,
      status: 'warning',
      output: `Code Agent is deprecated. Please move to broker only Snyk Code support.`,
    } satisfies CheckResult;
  }

  return {
    id: checkOptions.id,
    name: checkOptions.name,
    status: 'passing',
    output: config.DISABLE_CODE_AGENT_PREFLIGHT_CHECK
      ? 'Code Agent Preflight Check disabled.'
      : 'Code Agent not in use.',
  } satisfies CheckResult;
};
