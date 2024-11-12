import { Request, Response } from 'express';

import { LoadedClientOpts, LoadedServerOpts } from '../types/options';
import { BrokerClientRequestWorkload } from '../../broker-workload/clientRequest';

// 1. Request coming in over HTTP conn (logged)
// 2. Filter for rule match (log and block if no match)
// 3. Relay over websocket conn (logged)
// 4. Get response over websocket conn (logged)
// 5. Send response over HTTP conn
export const forwardHttpRequest = (
  options: LoadedClientOpts | LoadedServerOpts,
) => {
  return async (req: Request, res: Response) => {
    const workload = new BrokerClientRequestWorkload(req, res, options);
    await workload.handler();
  };
};
