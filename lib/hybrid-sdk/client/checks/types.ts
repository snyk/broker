import type { Config } from '../types/config';

/**
 * Represents an abstract check with common functionality and properties.
 * All other custom checks must extend this interface.
 */
export interface Check {
  id: CheckId;
  name: string;
  enabled: boolean;

  check: CheckFn;
}

/**
 * HttpCheck is used to make an HTTP request to determine the health of a given check.
 */
export interface HttpCheck extends Check {
  url: string;
  method: 'GET' | 'POST';
  timeoutMs: number;
}

/** CheckResult is used to render check in JSON format. */
export interface CheckResult {
  readonly id: CheckId;
  readonly name: string;
  readonly status: CheckStatus;
  readonly output: string;
}

export type CheckId = string;
export type CheckOptions = { id: CheckId; name: string };
export type CheckStatus = 'passing' | 'warning' | 'error';

/**
 * A check function needed to implement by individual checks.
 */
export type CheckFn = (config?: Config) => Promise<CheckResult> | CheckResult;
