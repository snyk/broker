import { forwardHttpRequest } from '../../common/relay/forwardHttpRequest';
import { forwardWebSocketRequest } from '../../common/relay/forwardWebsocketRequest';
import { LoadedServerOpts } from '../../common/types/options';
import { initIdentifyHandler } from './identifyHandler';

let forwardWebSocketResponse;
let forwardHttpRequestHandler;

export const initConnectionHandler = (
  serverOpts: LoadedServerOpts,
  websocket,
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
