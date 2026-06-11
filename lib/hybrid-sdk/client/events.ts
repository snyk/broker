import {
  BrokerErrorCode,
  CLIENT_EVENT_MESSAGE,
  ClientEvent,
  ClientEventEnvelope,
  ClientShutdownReason,
} from '../common/types/telemetry';
import { log as logger } from '../../logs/logger';

// The socket is registered on WS 'open' and cleared on 'close', so a non-null
// eventSocket is always connected — hence emit() needs no readyState check.

interface EventSocket {
  send(event: string, data: unknown): void;
}

let eventSocket: EventSocket | null = null;

export const registerEventSocket = (socket: EventSocket): void => {
  eventSocket = socket;
};

export const clearEventSocket = (): void => {
  eventSocket = null;
};

const emit = (event: ClientEvent): void => {
  if (!eventSocket) return;
  const envelope: ClientEventEnvelope = {
    ts: Date.now(),
    event,
  };
  try {
    eventSocket.send(CLIENT_EVENT_MESSAGE, envelope);
  } catch (err) {
    logger.debug({ err }, 'Failed to emit broker client event');
  }
};

export const emitError = (error: {
  errorCode: BrokerErrorCode;
  requestId?: string;
  integrationType?: string;
}): void => emit({ type: 'client-error', ...error });

export const emitShutdown = (shutdown: {
  reason: ClientShutdownReason;
  uptimeSeconds: number;
  errorCode?: string;
}): void => emit({ type: 'client-shutdown', ...shutdown });
