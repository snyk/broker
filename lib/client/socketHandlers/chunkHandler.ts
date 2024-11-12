import { legacyStreamResponseHandler } from '../../hybrid-sdk/LegacyStreamResponseHandler';

export const chunkHandler = (connectionIdentifier) => {
  return legacyStreamResponseHandler(connectionIdentifier);
};
