import { streamResponseHandler } from '../../common/relay';

export const chunkHandler = (clientOps) => {
  return streamResponseHandler(clientOps.config.brokerToken);
};
