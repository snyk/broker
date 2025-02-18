import { legacyStreamResponseHandler } from '../../LegacyStreamResponseHandler';

export const chunkHandler = (connectionIdentifier) => {
  return legacyStreamResponseHandler(connectionIdentifier);
};
