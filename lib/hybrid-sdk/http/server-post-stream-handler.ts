import stream from 'stream';

import { Response } from 'express';
import NodeCache from 'node-cache';
import { getConfig } from '../../common/config/config';
import { observeResponseSize } from '../../common/utils/metrics';

export const streamsStore = new NodeCache({
  stdTTL: parseInt(getConfig().cacheExpiry) || 3600, // 1 hour
  checkperiod: parseInt(getConfig().cacheCheckPeriod) || 60, // 1 min
  useClones: false,
});

export interface StreamResponse {
  streamBuffer: stream.PassThrough;
  response: Response;
  streamSize?: number;
  brokerAppClientId: string;
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
      streamResponse.brokerAppClientId,
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
      .set(statusAndHeaders.headers);
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
