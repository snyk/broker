import stream from 'stream';

import { Response } from 'express';
import NodeCache from 'node-cache';
import { getConfig } from '../common/config/config';
import { observeResponseSize } from '../common/utils/metrics';

export const streamsStore = new NodeCache({
  stdTTL: parseInt(getConfig().cacheExpiry) || 3600, // 1 hour
  checkperiod: parseInt(getConfig().cacheCheckPeriod) || 60, // 1 min
  useClones: false,
});

/**
 * Headers that describe the downstream connection rather than the entity, and
 * so must not be copied onto the connection we are answering on.
 *
 * Content-Length is the load-bearing one: when RES_BODY_URL_SUB is configured
 * the Broker Client rewrites URLs in the response body as it streams, which
 * changes the body length. Forwarding the downstream Content-Length then
 * declares a length we do not send, the response is truncated at that
 * boundary and the socket is left unusable.
 */
const CONNECTION_SCOPED_HEADERS = [
  'content-length',
  'transfer-encoding',
  'connection',
  'keep-alive',
];

export interface StreamResponse {
  streamBuffer: stream.PassThrough;
  response: Response;
  streamSize?: number;
  brokerAppClientId: string | null;
}

export class StreamResponseHandler {
  streamingID: string;
  streamResponse: StreamResponse;
  // streamBuffer;
  // response;
  // streamSize = 0;

  static create(streamingID) {
    const stream = streamsStore.get(streamingID);
    if (!stream) {
      return null;
    }
    const streamResponse = stream as StreamResponse;

    return new StreamResponseHandler(
      streamingID,
      streamResponse.streamBuffer,
      streamResponse.response,
      streamResponse.brokerAppClientId ?? null,
    );
  }

  constructor(streamingID, streamBuffer, response, brokerAppClientId) {
    this.streamingID = streamingID;
    this.streamResponse = {
      streamBuffer,
      response,
      streamSize: 0,
      brokerAppClientId,
    };
  }

  writeStatusAndHeaders = (statusAndHeaders) => {
    this.streamResponse.response
      .status(statusAndHeaders.status)
      .set(
        stripConnectionScopedHeaders(
          statusAndHeaders.headers,
          this.streamResponse.response.req?.method,
        ),
      );
  };

  writeChunk = (chunk, waitForDrainCb) => {
    this.streamResponse.streamSize += chunk.length;
    if (!this.streamResponse.streamBuffer.write(chunk) && waitForDrainCb) {
      waitForDrainCb(this.streamResponse.streamBuffer);
    }
  };

  finished = () => {
    this.streamResponse.streamBuffer.end();
    streamsStore.del(this.streamingID);
    observeResponseSize({
      bytes: this.streamResponse.streamSize,
      isStreaming: true,
    });
  };

  destroy = (error) => {
    this.streamResponse.streamBuffer.destroy(error);
    streamsStore.del(this.streamingID);
  };
}

/**
 * Returns a copy of the downstream headers with connection-scoped headers
 * removed, so Node frames the relayed response from what we actually write.
 *
 * A HEAD response carries no body, so its Content-Length describes the entity
 * and is kept.
 */
export const stripConnectionScopedHeaders = (
  headers: Record<string, unknown> = {},
  requestMethod?: string,
): Record<string, unknown> => {
  const isHeadRequest = requestMethod?.toUpperCase() === 'HEAD';
  const sanitized: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(headers)) {
    const normalized = name.toLowerCase();
    if (CONNECTION_SCOPED_HEADERS.includes(normalized)) {
      if (!(normalized === 'content-length' && isHeadRequest)) {
        continue;
      }
    }
    sanitized[name] = value;
  }
  return sanitized;
};
