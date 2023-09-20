import { forwardWebSocketRequest } from '../../common/relay/forwardWebsocketRequest';
import { ClientOpts } from '../types/client';

export const initializeRequestHandler = (io, clientOps: ClientOpts) => {
  return forwardWebSocketRequest(clientOps, io);
};

