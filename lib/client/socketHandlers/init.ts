import { ClientOpts } from '../types/client';
import { initRequestHandler } from './requestHandler';

export const initializeSocketHandlers = (io, clientOpts: ClientOpts) => {
  initRequestHandler(io, clientOpts);
};
