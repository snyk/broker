import { Config } from '../../types/config';
import { CheckOptions, CheckResult } from '../types';
import { existsSync, readFileSync } from 'node:fs';
import { findFactoryRoot } from '../../../common/config/config';
import { resolve } from 'node:path';
export const validateWorkloadConfig = (
  checkOptions: CheckOptions,
  config: Config,
): CheckResult => {
  const workloadKeys = Object.keys(config).filter((x) =>
    x.includes('_WORKLOAD_'),
  );
  if (workloadKeys.length < 4) {
    return {
      id: checkOptions.id,
      name: checkOptions.name,
      status: 'error',
      output: `Workload configuration missing. Please use or update config from https://github.com/snyk/broker/blob/master/config.default.json.`,
    } satisfies CheckResult;
  }

  const REMOTE_WORKLOAD_NAME = config.REMOTE_WORKLOAD_NAME;
  const REMOTE_WORKLOAD_MODULE_PATH = config.REMOTE_WORKLOAD_MODULE_PATH;
  const CLIENT_WORKLOAD_NAME = config.CLIENT_WORKLOAD_NAME;
  const CLIENT_WORKLOAD_MODULE_PATH = config.CLIENT_WORKLOAD_MODULE_PATH;

  if (
    !verifyClassAndHandler(REMOTE_WORKLOAD_NAME, REMOTE_WORKLOAD_MODULE_PATH) ||
    !verifyClassAndHandler(CLIENT_WORKLOAD_NAME, CLIENT_WORKLOAD_MODULE_PATH)
  ) {
    return {
      id: checkOptions.id,
      name: checkOptions.name,
      status: 'error',
      output: `Workload configuration invalid. The workload cannot be found or is not containing the expected method(s).`,
    } satisfies CheckResult;
  }

  return {
    id: checkOptions.id,
    name: checkOptions.name,
    status: 'passing',
    output: 'Workload configuration OK.',
  } satisfies CheckResult;
};

function verifyClassAndHandler(className, filePath) {
  try {
    const root = findFactoryRoot(__dirname);
    if (!root) {
      return false;
    }
    const absolutePath = resolve(`${root}`, filePath) + '.js';
    if (!existsSync(absolutePath)) {
      return false;
    }
    const fileContent = readFileSync(absolutePath, 'utf-8');

    if (!fileContent) {
      return false;
    }
    const classRegex = new RegExp(`class\\s+${className}\\s*extends`);
    const handlerRegex = /handler\s*\(/;

    if (!classRegex.test(fileContent)) {
      return false;
    }

    return handlerRegex.test(fileContent);
  } catch (error) {
    const errorMessage = `Error validating Workload configuration. ${error}`;
    throw new Error(errorMessage);
  }
}
