import { log as logger } from '../../logs/logger';

interface AbortCapableSocket {
  send: (event: string, ...args: any[]) => void;
}

/**
 * Tell the broker server that a response-data upload for `streamingId` failed,
 * so it can fail the originating request immediately instead of waiting out the
 * server-side deadline. Best-effort: no-op when disabled or when no socket is
 * available (the server deadline remains the correctness backstop).
 */
export const emitResponseDataAbort = (
  ws: AbortCapableSocket | undefined,
  streamingId: string,
  reason: string,
  config: any,
): void => {
  if (String(config?.brokerResponseDataFailfastEnabled) === 'false') {
    return;
  }
  if (!ws || typeof ws.send !== 'function') {
    return;
  }
  try {
    ws.send('abort', streamingId, reason);
  } catch (err) {
    logger.warn(
      { streamingId, err },
      'Failed to emit response-data abort over websocket',
    );
  }
};
