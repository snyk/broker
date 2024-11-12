import { log as logger } from '../../../logs/logger';
import version from '../../../common/utils/version';
import { retry } from '../../retry/exponential-backoff';
import type { CheckId, CheckResult, CheckStatus } from '../types';
import {
  HttpResponse,
  makeSingleRawRequestToDownstream,
} from '../../../hybrid-sdk/http/request';

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
    const request = {
      url: httpOptions.url,
      method: httpOptions.method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': `broker client/${version} (http check service)`,
      },
      timeoutMs: httpOptions.timeoutMs,
    };
    const response: HttpResponse = await retry<HttpResponse>(
      () => makeSingleRawRequestToDownstream(request),
      { retries: 3, operation: `http check ${checkOptions.id}` },
    );
    logger.trace({ response: response }, 'http check raw response data');

    const checkResult = convertHttpResponseToCheckResult(
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

export function convertHttpResponseToCheckResult(
  check: { id: CheckId; name: string; url: string; method: 'GET' | 'POST' },
  response: HttpResponse,
): CheckResult {
  let status: CheckStatus;
  if (
    response.statusCode &&
    response.statusCode >= 200 &&
    response.statusCode <= 299
  ) {
    status = 'passing';
  } else if (response.statusCode == 429) {
    status = 'warning';
  } else {
    status = 'error';
  }

  const output = `HTTP ${check.method} ${check.url}: ${response.statusCode} ${
    response.statusText
  }, response: ${truncate(JSON.stringify(response.body))}`;

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
