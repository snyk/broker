import {
  BrokerErrorCode,
  CLIENT_EVENT_MESSAGE,
  ClientEvent,
  ClientEventEnvelope,
  ClientShutdownReason,
} from '../common/types/telemetry';
import { log as logger } from '../../logs/logger';

// One entry per live websocket connection, added on 'open' and removed on 'close'.

interface EventSocket {
  send(event: string, data: unknown): void;
}

const eventSockets = new Set<EventSocket>();

export const registerEventSocket = (socket: EventSocket): void => {
  eventSockets.add(socket);
};

export const clearEventSocket = (socket: EventSocket): void => {
  eventSockets.delete(socket);
};

// emit selects a single websocket to send the event.
const emit = (event: ClientEvent): void => {
  const socket = eventSockets.values().next().value;
  if (!socket) return;
  const envelope: ClientEventEnvelope = {
    ts: Date.now(),
    event,
  };
  try {
    socket.send(CLIENT_EVENT_MESSAGE, envelope);
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
