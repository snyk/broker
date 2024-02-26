import { legacyStreamResponseHandler } from '../../common/relay/LegacyStreamResponseHandler';

export const chunkHandler = (connectionIdentifier) => {
  return legacyStreamResponseHandler(connectionIdentifier);
};
