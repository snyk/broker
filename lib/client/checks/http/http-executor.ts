import * as logger from '../../../log';
import * as version from '../../../version';
import { axiosInstance } from '../../../axios';
import { retry } from '../../retry/exponential-backoff';
import type { AxiosResponse } from 'axios';
import type { CheckId, CheckResult, CheckStatus } from '../types';

export async function executeHttpRequest(
  checkOptions: {
    id: CheckId;
    name: string;
  },
  httpOptions: {
    url: string;
    method: 'GET' | 'POST';
    timeoutMs: number;
  },
): Promise<CheckResult> {
  logger.debug({ checkId: checkOptions.id }, 'executing http check');

  try {
    const response = await retry<CheckResult>(
      () =>
        axiosInstance.request({
          method: httpOptions.method,
          url: httpOptions.url,
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': `broker client/${version} (http check service)`,
          },
          timeout: httpOptions.timeoutMs,
          validateStatus: () => true,
        }),
      { retries: 3, operation: `http check ${checkOptions.id}` },
    );
    logger.trace({ response: response.data }, 'http check raw response data');

    const checkResult = convertAxiosResponseToCheckResult(
      {
        id: checkOptions.id,
        name: checkOptions.name,
        url: httpOptions.url,
        method: httpOptions.method,
      },
      response,
    );

    logger.debug(
      { checkId: checkOptions.id, status: checkResult.status },
      'completed http check execution',
    );
    return Promise.resolve(checkResult);
  } catch (error) {
    const errorMessage = `Error executing check with checkId ${checkOptions.id}`;
    logger.debug({ error }, errorMessage);
    throw new Error(errorMessage);
  }
}

export function convertAxiosResponseToCheckResult(
  check: { id: CheckId; name: string; url: string; method: 'GET' | 'POST' },
  response: AxiosResponse,
): CheckResult {
  let status: CheckStatus;
  if (response.status >= 200 && response.status <= 299) {
    status = 'passing';
  } else if (response.status == 429) {
    status = 'warning';
  } else {
    status = 'error';
  }

  const output = `HTTP ${check.method} ${check.url}: ${response.status} ${
    response.statusText
  }, response: ${truncate(JSON.stringify(response.data))}`;

  return {
    id: check.id,
    name: check.name,
    status,
    output,
  } satisfies CheckResult;
}

const truncate = (text: string): string => {
  if (text.length <= 200) {
    return text;
  }
  const truncatedText = text.substring(0, 200);
  return `${truncatedText}... (truncated)`;
};
