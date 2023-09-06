import { forwardWebSocketRequest } from '../../common/relay';
import { RequestPayload } from '../../common/types/http';
import { ClientOpts } from '../types/client';

let initializedReqHandler: (
  token: string,
) => (payload: RequestPayload, emit: any) => void;

export const initRequestHandler = (io, clientOps: ClientOpts) => {
  initializedReqHandler = forwardWebSocketRequest(
    clientOps.filters?.private,
    clientOps.config,
    io,
    clientOps.serverId,
  );
};

export const requestHandler = (token) => {
  return initializedReqHandler(token);
};
