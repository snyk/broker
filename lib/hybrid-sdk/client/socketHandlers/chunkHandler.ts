import { legacyStreamResponseHandler } from '../../LegacyStreamResponseHandler';

export const chunkHandler = (connectionIdentifier: string) => {
  return legacyStreamResponseHandler(connectionIdentifier);
};
