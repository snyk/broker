import { forwardWebSocketRequest } from '../../common/relay/forwardWebsocketRequest';
import { RequestPayload } from '../../common/types/http';
import { LoadedClientOpts } from '../../common/types/options';

let initializedReqHandler: (
  webSocketIdentifier: string,
) => (payload: RequestPayload, emit: any) => void;

export const initRequestHandler = (websocket, clientOps: LoadedClientOpts) => {
  initializedReqHandler = forwardWebSocketRequest(clientOps, websocket);
};

export const requestHandler = (webSocketIdentifier) => {
  return initializedReqHandler(webSocketIdentifier);
};
