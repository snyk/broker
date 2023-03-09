export type CheckId = string;
export type CheckStatus = 'passing' | 'warning' | 'error' | undefined;

export interface Check {
  checkId: CheckId;
  checkName: string;
  checkStatus?: CheckStatus;

  output?: string;
  timeoutMs: number;
  url: string;
}

/** CheckResult is used to render check in JSON format. */
export interface CheckResult {
  id: string;
  name: string;
  status: CheckStatus;
  output: string;
}
