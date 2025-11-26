import { LoadedClientOpts } from '../../common/types/options';
import { initRequestHandler } from './requestHandler';
import { WebSocketServer } from '../../server/types/socket';
import { WebSocketConnection } from '../types/client';

export const initializeSocketHandlers = (
  io: WebSocketServer | WebSocketConnection,
  clientOpts: LoadedClientOpts,
) => {
  initRequestHandler(io, clientOpts);
};
