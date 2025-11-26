import { Request, Response } from 'express';
import { forwardHttpRequest } from '../../common/connectionToWorkloadInterface/forwardHttpRequest';
import { forwardWebSocketRequest } from '../../common/connectionToWorkloadInterface/forwardWebsocketRequest';
import { RequestPayload } from '../../common/types/http';
import { LoadedServerOpts } from '../../common/types/options';
import { initIdentifyHandler } from './identifyHandler';
import { WebSocketServer } from '../types/socket';
import { HybridResponse } from '../../responseSenders';

let forwardWebSocketResponse: (
  connectionIdentifier: string,
) => (
  payload: RequestPayload,
  emit: (response: HybridResponse) => void,
) => Promise<void>;

let forwardHttpRequestHandler: (req: Request, res: Response) => Promise<void>;

export const initConnectionHandler = (
  serverOpts: LoadedServerOpts,
  websocket: WebSocketServer,
) => {
  forwardWebSocketResponse = forwardWebSocketRequest(serverOpts, websocket);
  forwardHttpRequestHandler = forwardHttpRequest(serverOpts);
  initRelevantHandlers();
};

const initRelevantHandlers = () => {
  initIdentifyHandler();
};
export const getForwardWebSocketRequestHandler = () => {
  return forwardWebSocketResponse;
};
export const getForwardHttpRequestHandler = () => {
  return forwardHttpRequestHandler;
};
