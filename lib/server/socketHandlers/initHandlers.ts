import {
  forwardWebSocketRequest,
  forwardHttpRequest,
} from '../../common/relay';
import { ServerOpts } from '../types/http';
import { initIdentifyHandler } from './identifyHandler';

let forwardWebSocketResponse;
let forwardHttpRequestHandler;

export const initConnectionHandler = (serverOpts: ServerOpts, io) => {
  forwardWebSocketResponse = forwardWebSocketRequest(
    serverOpts.filters?.private,
    serverOpts.config,
    io,
  );
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
