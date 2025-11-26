import { forwardWebSocketRequest } from '../../common/connectionToWorkloadInterface/forwardWebsocketRequest';
import { RequestPayload } from '../../common/types/http';
import { LoadedClientOpts } from '../../common/types/options';
import { WebSocketConnection } from '../types/client';
import { WebSocketServer } from '../../server/types/socket';

let initializedReqHandler: (
  webSocketIdentifier: string,
) => (payload: RequestPayload, emit: any) => void;

export const initRequestHandler = (
  websocket: WebSocketServer | WebSocketConnection,
  clientOps: LoadedClientOpts,
) => {
  initializedReqHandler = forwardWebSocketRequest(clientOps, websocket);
};

export const requestHandler = (webSocketIdentifier: string) => {
  return initializedReqHandler(webSocketIdentifier);
};
