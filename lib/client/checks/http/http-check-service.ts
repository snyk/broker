import logger = require('../../../log');
import version = require('../../../version');
import { axiosInstance } from '../../axios/axios';
import { Check, CheckId, CheckResult, CheckStatus } from '../types';
import { CheckService } from '../check-service';
import { CheckStore } from '../check-store';

export class HttpCheckService implements CheckService {
  constructor(private readonly checkStore: CheckStore) {}

  async run(checkId: CheckId): Promise<CheckResult> {
    logger.debug({ checkId }, 'executing http check');

    const check = await this.checkStore.get(checkId);
    if (check === null) {
      throw new Error(`Not found check with checkId: '${checkId}'`);
    }

    try {
      const response = await axiosInstance.get(check.url, {
        headers: {
          'User-Agent': `broker client/${version} (http check service)`,
        },
        timeout: check.timeoutMs,
      });

      const checkResult = convertResponseToCheckResult(
        check,
        response.status,
        response.statusText,
        JSON.stringify(response.data),
      );

      return Promise.resolve(checkResult);
    } catch (error) {
      const errorMessage = `Error executing check with checkId ${checkId}`;
      logger.debug({ error }, errorMessage);
      throw new Error(errorMessage);
    }
  }
}

function convertResponseToCheckResult(
  check: Check,
  statusCode: number,
  statusText: string,
  response: string,
): CheckResult {
  let status: CheckStatus;
  if (statusCode >= 200 && statusCode <= 299) {
    status = 'passing';
  } else if (statusCode == 429) {
    status = 'warning';
  } else {
    status = 'error';
  }

  const output = `HTTP GET ${
    check.url
  }: ${statusCode} ${statusText}, response: ${truncate(response)}`;

  return {
    id: check.checkId,
    name: check.checkName,
    output: output,
    status: status,
  };
}

function truncate(response: string): string {
  if (response.length <= 200) {
    return response;
  }
  const truncatedResponse = response.substring(0, 200);
  return `${truncatedResponse}... (truncated)`;
}
