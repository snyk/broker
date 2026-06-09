import { log as logger } from '../../../logs/logger';
import { ClientEventEnvelope } from '../../common/types/telemetry';

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

const FATAL_SHUTDOWN_REASONS = new Set(['uncaught_exception', 'auth_4xx']);

const severityFor = (event: { type?: string; reason?: string }) => {
  if (event.type === 'client-error') return 'warn' as const;
  if (event.type === 'client-shutdown') {
    return FATAL_SHUTDOWN_REASONS.has(event.reason ?? '')
      ? ('error' as const)
      : ('info' as const);
  }
  return 'info' as const; // unknown/forward-compat types: log, never drop
};

export const handleClientEvent =
  (identity: ClientEventIdentity) =>
  (message: ClientEventEnvelope): void => {
    const event = message?.event as
      | (Record<string, unknown> & { type?: string })
      | undefined;
    if (!event || typeof event.type !== 'string') {
      logger.warn(
        { ...identity, schemaVersion: message?.schemaVersion },
        'Received malformed broker client event',
      );
      return;
    }

    const { type, ...eventFields } = event;
    logger[severityFor(event)](
      {
        ...eventFields,
        eventType: type,
        schemaVersion: message.schemaVersion,
        clientTs: message.ts,
        ...identity, // last, so nothing in the payload can override identity
      },
      'broker client event',
    );
  };
