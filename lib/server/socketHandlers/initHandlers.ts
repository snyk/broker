import { forwardHttpRequest } from '../../common/relay/forwardHttpRequest';
import { forwardWebSocketRequest } from '../../common/relay/forwardWebsocketRequest';
import { ServerOpts } from '../types/http';
import { initIdentifyHandler } from './identifyHandler';

let forwardWebSocketResponse;
let forwardHttpRequestHandler;

export const initConnectionHandler = (serverOpts: ServerOpts, io) => {
  forwardWebSocketResponse = forwardWebSocketRequest(serverOpts, io);
  forwardHttpRequestHandler = forwardHttpRequest(serverOpts.filters?.public);
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
