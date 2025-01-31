import { Request, Response } from 'express';

import { LoadedClientOpts, LoadedServerOpts } from '../types/options';
import {
  LocalClientWorkloadRuntimeParams,
  Workload,
  WorkloadType,
} from '../../hybrid-sdk/workloadFactory';
import { BrokerClientRequestWorkload } from '../../broker-workload/clientRequests';

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
    const workloadName =
      options.config.workloadName ?? 'BrokerClientRequestWorkload';
    const workloadModulePath =
      options.config.workloadModulePath ?? '../broker-workload/clientRequests';

    const workload = (await Workload.instantiate(
      workloadName,
      workloadModulePath,
      WorkloadType.localClient,
      { req, res, options },
    )) as BrokerClientRequestWorkload;

    const data: LocalClientWorkloadRuntimeParams = {
      makeRequestOverHttp: makeHttpRequest,
    };
    await workload.handler(data);
  };
};
