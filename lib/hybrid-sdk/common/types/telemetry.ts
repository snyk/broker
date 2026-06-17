export const BROKER_ERROR_CODES = {
  // Carry a synthesized status; used when no downstream response exists.
  DOWNSTREAM_TIMEOUT: 'DOWNSTREAM_TIMEOUT',
  DOWNSTREAM_UNREACHABLE: 'DOWNSTREAM_UNREACHABLE',
  DOWNSTREAM_ERROR: 'DOWNSTREAM_ERROR',
  FILTER_BLOCKED: 'FILTER_BLOCKED',
  BODY_TOO_LARGE: 'BODY_TOO_LARGE',
  // Label a status the downstream already returned; status from downstream response.
  DOWNSTREAM_UNAUTHORIZED: 'DOWNSTREAM_UNAUTHORIZED',
  DOWNSTREAM_FORBIDDEN: 'DOWNSTREAM_FORBIDDEN',
  DOWNSTREAM_RATE_LIMITED: 'DOWNSTREAM_RATE_LIMITED',
  DOWNSTREAM_SERVER_ERROR: 'DOWNSTREAM_SERVER_ERROR',
  DOWNSTREAM_UNEXPECTED: 'DOWNSTREAM_UNEXPECTED',
  // Event-only codes (emitted on client events); never a response errorType.
  SEND_BACK_FAILED: 'SEND_BACK_FAILED',
  JWT_REFRESH_FAILED: 'JWT_REFRESH_FAILED',
  AUTH_RENEWAL_FAILED: 'AUTH_RENEWAL_FAILED',
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

// undefined means the status needs no error code.
export const classifyDownstreamStatus = (
  status: number,
): BrokerErrorCode | undefined => {
  if (status === 401) return 'DOWNSTREAM_UNAUTHORIZED';
  if (status === 403) return 'DOWNSTREAM_FORBIDDEN';
  if (status === 429) return 'DOWNSTREAM_RATE_LIMITED';
  if (status >= 500 && status <= 599) return 'DOWNSTREAM_SERVER_ERROR';
  if (status >= 400 && status !== 404) return 'DOWNSTREAM_UNEXPECTED';
  return undefined;
};

export interface BrokerErrorBody {
  code: BrokerErrorCode;
  message: string;
}

// Reasons the client records before process.exit(); a subset feeds client-shutdown events.
export const PROCESS_EXIT_REASONS = {
  RECONNECT_EXHAUSTION: 'reconnect_exhaustion',
  UNCAUGHT_EXCEPTION: 'uncaught_exception',
  OAUTH_TOKEN_UNAVAILABLE: 'oauth_token_unavailable',
} as const;

export type ProcessExitReason =
  (typeof PROCESS_EXIT_REASONS)[keyof typeof PROCESS_EXIT_REASONS];

export const CONNECTION_STATES = [
  'connected',
  'reconnecting',
  'failed',
] as const;
export type ConnectionState = (typeof CONNECTION_STATES)[number];

// Structured events the broker client emits over the existing websocket.
// Every field must stay bounded (enums, ids, numbers) — never free-form
// strings — so customer data cannot reach server logs.
export const CLIENT_EVENT_MESSAGE = 'client-event';

// A process exit (fatal) or a clean shutdown.
export type ClientShutdownReason = ProcessExitReason | 'clean';

export type ClientEvent =
  | {
      type: 'client-error';
      errorCode: BrokerErrorCode;
      requestId?: string;
      integrationType?: string;
    }
  | {
      type: 'client-shutdown';
      reason: ClientShutdownReason;
      uptimeSeconds: number;
      errorCode?: SafeNodeErrno; // callers must use safeNodeErrno(); type enforces this
    };

export type ClientEventType = ClientEvent['type'];

export interface ClientEventEnvelope {
  ts: number; // client clock; server stamps the authoritative receipt time
  event: ClientEvent;
}

// OS-level errno codes that are safe to include in server logs.
// All other values — including library-defined codes like ERR_TLS_CERT_ALTNAME_INVALID
// — are stripped by safeNodeErrno() before the event is emitted.
const KNOWN_NODE_ERRNO_LIST = [
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EPIPE',
  'EADDRINUSE',
  'EACCES',
  'ENOENT',
  'EBUSY',
  'EMFILE',
  'ENOMEM',
  'EPROTO',
  'ESOCKETTIMEDOUT',
] as const;

export type SafeNodeErrno = (typeof KNOWN_NODE_ERRNO_LIST)[number];
export const KNOWN_NODE_ERRNOS = new Set<string>(KNOWN_NODE_ERRNO_LIST);

/** Returns `code` only when it is a known OS-level errno; strips everything else. */
export const safeNodeErrno = (
  code: string | undefined,
): SafeNodeErrno | undefined =>
  code !== undefined && KNOWN_NODE_ERRNOS.has(code)
    ? (code as SafeNodeErrno)
    : undefined;
