import { Config } from '../../types/config';
import { CheckOptions, CheckResult } from '../types';

export const validateAcceptFlagsConfig = (
  checkOptions: CheckOptions,
  config: Config,
): CheckResult => {
  const acceptFlagKeys = Object.keys(config).filter((x) =>
    x.startsWith('ACCEPT_'),
  );
  if (
    config.ACCEPT &&
    config.ACCEPT != 'accept.json' &&
    acceptFlagKeys.length > 0
  ) {
    return {
      id: checkOptions.id,
      name: checkOptions.name,
      status: 'error',
      output: `ACCEPT_ flags are not compatible with custom accept.json files. Please refrain from using custom accept json (Code Agent is deprecated, see documentation).`,
    } satisfies CheckResult;
  }

  return {
    id: checkOptions.id,
    name: checkOptions.name,
    status: 'passing',
    output: 'ACCEPT flags configuration OK.',
  } satisfies CheckResult;
};
