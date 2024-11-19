import {
  streamsStore,
  StreamResponse,
} from './http/server-post-stream-handler';
import { log as logger } from '../logs/logger';
import { observeResponseSize } from '../common/utils/metrics';

/**
 * @deprecated Deprecated in favour of {@link StreamResponseHandler} */
export const legacyStreamResponseHandler = (token) => {
  return (streamingID, chunk, finished, ioResponse) => {
    const streamFromId = streamsStore.get(streamingID) as StreamResponse;

    if (streamFromId) {
      const { streamBuffer, response } = streamFromId;
      let { streamSize } = streamFromId;

      if (streamBuffer) {
        if (ioResponse) {
          response.status(ioResponse.status).set(ioResponse.headers);
        }
        if (chunk) {
          streamSize += chunk.length;
          streamBuffer.write(chunk);
          streamsStore.set(streamingID, { streamSize, streamBuffer, response });
        }
        if (finished) {
          streamBuffer.end();
          streamsStore.del(streamingID);
          observeResponseSize({
            bytes: streamSize,
            isStreaming: true,
          });
        }
      } else {
        logger.warn({ streamingID, token }, 'discarding binary chunk');
      }
    } else {
      logger.warn(
        { streamingID, token },
        'trying to write into a closed stream',
      );
    }
  };
};
