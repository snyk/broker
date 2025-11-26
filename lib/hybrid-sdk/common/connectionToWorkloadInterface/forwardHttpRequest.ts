import { Request, Response } from 'express';
import {
  Workload,
  WorkloadType,
  LocalClientWorkloadRuntimeParams,
} from '../../workloadFactory';
import { LoadedClientOpts, LoadedServerOpts } from '../types/options';

// 1. Request coming in over HTTP conn (logged)
// 2. Filter for rule match (log and block if no match)
// 3. Relay over websocket conn (logged)
// 4. Get response over websocket conn (logged)
// 5. Send response over HTTP conn
export const forwardHttpRequest = (
  options: LoadedClientOpts | LoadedServerOpts,
  makeHttpRequest = false,
) => {
  return async (req: Request, res: Response) => {
    const workloadName = options.config.clientWorkloadName;
    const workloadModulePath = options.config.clientWorkloadModulePath;

    const workload = await Workload.instantiate(
      workloadName,
      workloadModulePath,
      WorkloadType.localClient,
      { req, res, options },
    );

    const data: LocalClientWorkloadRuntimeParams = {
      makeRequestOverHttp: makeHttpRequest,
    };
    await workload.handler(data);
  };
};
