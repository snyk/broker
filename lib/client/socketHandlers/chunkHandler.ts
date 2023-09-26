import { legacyStreamResponseHandler } from '../../common/relay/LegacyStreamResponseHandler';

export const chunkHandler = (clientOps) => {
  return legacyStreamResponseHandler(clientOps.config.brokerToken);
};
