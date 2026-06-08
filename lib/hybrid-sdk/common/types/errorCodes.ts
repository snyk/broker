// BROKER_ERROR_CODES is a list of standard broker errors.
export const BROKER_ERROR_CODES = {
  DOWNSTREAM_TIMEOUT: 'DOWNSTREAM_TIMEOUT',
  DOWNSTREAM_UNREACHABLE: 'DOWNSTREAM_UNREACHABLE',
  DOWNSTREAM_ERROR: 'DOWNSTREAM_ERROR',
  FILTER_BLOCKED: 'FILTER_BLOCKED',
  BODY_TOO_LARGE: 'BODY_TOO_LARGE',
} as const;

export type BrokerErrorCode =
  (typeof BROKER_ERROR_CODES)[keyof typeof BROKER_ERROR_CODES];

// SYNTHESIZED_STATUS applies only when no downstream response exists.
// It should never be used to overwrite a downstream status code.
const SYNTHESIZED_STATUS: Partial<Record<BrokerErrorCode, number>> = {
  DOWNSTREAM_TIMEOUT: 504,
  DOWNSTREAM_UNREACHABLE: 502,
  DOWNSTREAM_ERROR: 502,
  FILTER_BLOCKED: 401,
  BODY_TOO_LARGE: 502,
};

export const statusForErrorCode = (code: BrokerErrorCode): number => {
  const status = SYNTHESIZED_STATUS[code];
  if (status === undefined) {
    throw new Error(`No synthesized status for broker error code: ${code}`);
  }
  return status;
};

const ERRNO_TO_CODE: Record<string, BrokerErrorCode> = {
  ETIMEDOUT: 'DOWNSTREAM_TIMEOUT',
  ECONNREFUSED: 'DOWNSTREAM_UNREACHABLE',
  ENOTFOUND: 'DOWNSTREAM_UNREACHABLE',
};

export const classifyDownstreamError = (error: unknown): BrokerErrorCode => {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return (code && ERRNO_TO_CODE[code]) || 'DOWNSTREAM_ERROR';
};

export interface BrokerErrorBody {
  code: BrokerErrorCode;
  message: string;
}
