import { forwardWebSocketRequest } from '../../common/relay/forwardWebsocketRequest';
import { RequestPayload } from '../../common/types/http';
import { ClientOpts } from '../types/client';

let initializedReqHandler: (
  token: string,
) => (payload: RequestPayload, emit: any) => void;

export const initRequestHandler = (io, clientOps: ClientOpts) => {
  initializedReqHandler = forwardWebSocketRequest(clientOps, io);
};

export const requestHandler = (token) => {
  return initializedReqHandler(token);
};
