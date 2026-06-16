import { log as logger } from '../../../logs/logger';
import {
  BROKER_ERROR_CODES,
  ClientEventEnvelope,
  KNOWN_NODE_ERRNOS,
  PROCESS_EXIT_REASONS,
} from '../../common/types/telemetry';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_LABEL_RE = /^[a-zA-Z0-9_-]{1,64}$/;

// All valid errorCode values: BrokerErrorCode enum members + OS-level errnos.
const VALID_ERROR_CODES = new Set<string>([
  ...Object.values(BROKER_ERROR_CODES),
  ...KNOWN_NODE_ERRNOS,
]);

const sanitizeEventFields = (
  fields: Record<string, unknown>,
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (k === 'requestId') {
      if (typeof v === 'string' && UUID_RE.test(v)) out[k] = v;
    } else if (k === 'integrationType') {
      if (typeof v === 'string') {
        const truncated = v.slice(0, 64);
        if (SAFE_LABEL_RE.test(truncated)) out[k] = truncated;
      }
    } else if (k === 'errorCode') {
      if (typeof v === 'string' && VALID_ERROR_CODES.has(v)) out[k] = v;
    } else if (k === 'reason') {
      if (typeof v === 'string' && SAFE_LABEL_RE.test(v)) out[k] = v;
    } else if (k === 'uptimeSeconds') {
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0)
        out[k] = Math.round(v);
    } else if (typeof v === 'boolean' || v === null) {
      out[k] = v;
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      out[k] = v;
    } else if (typeof v === 'string') {
      out[k] = v.slice(0, 256);
    }
    // Objects/arrays from unrecognised fields are silently dropped.
  }
  return out;
};

// Server-owned identity, captured from the connection at identify time and
// stamped onto every client event. Never taken from the event payload, so a
// client cannot impersonate another install; hashedToken is the anchor.
export interface ClientEventIdentity {
  hashedToken: string;
  maskedToken: string;
  clientId?: string;
  clientVersion?: string;
  mode: 'universal' | 'legacy';
  deploymentId?: string;
}

const FATAL_SHUTDOWN_REASONS = new Set<string>([
  PROCESS_EXIT_REASONS.UNCAUGHT_EXCEPTION,
  PROCESS_EXIT_REASONS.OAUTH_TOKEN_UNAVAILABLE,
]);

const severityFor = (event: { type?: string; reason?: string }) => {
  if (event.type === 'client-error') return 'warn' as const;
  if (event.type === 'client-shutdown') {
    return FATAL_SHUTDOWN_REASONS.has(event.reason ?? '')
      ? ('error' as const)
      : ('info' as const);
  }
  return 'info' as const; // unknown/forward-compat types: log, never drop
};

// Rate limiting: no per-socket message cap is applied here. client-event is
// semantically bounded (a handful per connection lifetime), and the overall
// broker websocket protocol has no per-event-type rate limiting. If high-
// frequency emission becomes a concern, a per-Spark counter should be added.
export const handleClientEvent =
  (identity: ClientEventIdentity) =>
  (message: ClientEventEnvelope): void => {
    const event = message?.event as
      | (Record<string, unknown> & { type?: string })
      | undefined;
    if (!event || typeof event.type !== 'string') {
      logger.warn({ ...identity }, 'Received malformed broker client event');
      return;
    }

    const { type, ...eventFields } = event;
    const rawType = type.slice(0, 64);
    const eventType = SAFE_LABEL_RE.test(rawType) ? rawType : 'unknown';
    const clientTs =
      typeof message.ts === 'number' && Number.isFinite(message.ts)
        ? message.ts
        : undefined;
    const serverTs = Date.now();
    const safeFields = sanitizeEventFields(eventFields);
    const safeReason =
      typeof safeFields.reason === 'string' ? safeFields.reason : undefined;
    logger[severityFor({ type: eventType, reason: safeReason })](
      {
        ...safeFields,
        eventType,
        clientTs,
        serverTs,
        ...identity, // last, so nothing in the payload can override identity
      },
      'broker client event',
    );
  };
