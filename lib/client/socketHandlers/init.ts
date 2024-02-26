import { LoadedClientOpts } from '../../common/types/options';
import { initRequestHandler } from './requestHandler';

export const initializeSocketHandlers = (io, clientOpts: LoadedClientOpts) => {
  initRequestHandler(io, clientOpts);
};
