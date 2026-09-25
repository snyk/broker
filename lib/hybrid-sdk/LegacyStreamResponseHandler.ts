import { PassThrough } from 'stream';
import { pipeline } from 'stream/promises';

import { log as logger } from '../logs/logger';
import {
  PendingResponse,
  PendingResponseRegistry,
  pendingResponseRegistry,
} from './http/server-post-stream-handler';
import { ResponseMetadata } from './http/response-frame-decoder';
import { getDesensitizedToken } from './server/utils/token';

type LegacyChunk = Buffer | string | undefined;

/**
 * Adapts the callback-based websocket chunk protocol to a claimed response.
 *
 * The PassThrough is a source owned only by this legacy delivery. The actual
 * HTTP response remains in pipeline(), so its backpressure, errors and final
 * completion are included in the delivery lifecycle.
 */
class LegacyResponseDelivery {
  private readonly source = new PassThrough({ highWaterMark: 1024 * 1024 });
  private bodyBytes = 0;
  private ended = false;

  constructor(
    private readonly pending: PendingResponse,
    private readonly logContext: Record<string, unknown>,
    onSettled: () => void,
  ) {
    void pipeline(this.source, pending.destination)
      .then(() => pending.complete(this.bodyBytes))
      .catch((error: Error) => {
        pending.cancel(error);
        logger.error(
          { ...this.logContext, error },
          'Failed forwarding legacy websocket response stream.',
        );
      })
      .finally(onSettled);
  }

  write(
    chunk: LegacyChunk,
    finished: boolean,
    metadata?: ResponseMetadata,
  ): void {
    if (this.ended) {
      return;
    }

    try {
      if (metadata) {
        this.pending.applyMetadata(metadata);
      }
      if (chunk) {
        // Preserve the legacy receiver metric semantics for string chunks.
        this.bodyBytes += chunk.length;
        // The legacy event contract has no acknowledgement with which to
        // propagate drain. PassThrough preserves its buffering boundary while
        // pipeline coordinates the readable side and the real destination.
        this.source.write(chunk);
      }
      if (finished) {
        this.ended = true;
        this.source.end();
      }
    } catch (error) {
      this.ended = true;
      this.source.destroy(error as Error);
    }
  }

  cancel(error: Error): void {
    if (this.ended) {
      return;
    }

    this.ended = true;
    this.source.destroy(error);
  }
}

export interface LegacyStreamResponseHandler {
  (
    streamingID: string,
    chunk: LegacyChunk,
    finished: boolean,
    metadata?: ResponseMetadata,
  ): void;
  dispose(error: Error): void;
}

export const legacyStreamResponseHandler = (
  token: string,
  registry: PendingResponseRegistry = pendingResponseRegistry,
): LegacyStreamResponseHandler => {
  const deliveries = new Map<string, LegacyResponseDelivery>();
  let disposed = false;

  const handleChunk: LegacyStreamResponseHandler = (
    streamingID: string,
    chunk: LegacyChunk,
    finished: boolean,
    metadata?: ResponseMetadata,
  ): void => {
    if (disposed) {
      return;
    }

    let delivery = deliveries.get(streamingID);
    if (!delivery) {
      const claim = registry.claim(streamingID, {
        legacyConnectionIdentifier: token,
        enforceLegacyOwnership: true,
      });
      if (claim.status !== 'claimed') {
        const { maskedToken, hashedToken } = getDesensitizedToken(token);
        logger.warn(
          {
            streamingID,
            claimStatus: claim.status,
            maskedToken,
            hashedToken,
          },
          'Trying to write into a closed or claimed stream.',
        );
        return;
      }

      delivery = new LegacyResponseDelivery(
        claim.pending,
        { streamingID },
        () => deliveries.delete(streamingID),
      );
      deliveries.set(streamingID, delivery);
    }

    delivery.write(chunk, finished, metadata);
  };

  handleChunk.dispose = (error: Error): void => {
    if (disposed) {
      return;
    }

    disposed = true;
    for (const delivery of deliveries.values()) {
      delivery.cancel(error);
    }
  };

  return handleChunk;
};
