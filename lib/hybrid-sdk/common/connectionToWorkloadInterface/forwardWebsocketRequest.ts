import { RequestPayload } from '../types/http';
import { LoadedClientOpts, LoadedServerOpts } from '../types/options';
import {
  Workload,
  WorkloadType,
  RemoteServerWorkloadRuntimeParams,
} from '../../workloadFactory';
import { WebSocketServer } from '../../server/types/socket';
import { WebSocketConnection } from '../../client/types/client';
import { HybridResponse } from '../../responseSenders';
import { BrokerWorkload } from '../../../broker-workload/websocketRequests';

export const forwardWebSocketRequest = (
  options: LoadedClientOpts | LoadedServerOpts,
  websocketConnectionHandler: WebSocketServer | WebSocketConnection,
) => {
  // 1. Request coming in over websocket conn (logged)
  // 2. Filter for rule match (log and block if no match)
  // 3. Relay over HTTP conn (logged)
  // 4. Get response over HTTP conn (logged)
  // 5. Send response over websocket conn

  return (connectionIdentifier) =>
    async (
      payload: RequestPayload,
      emit: (response: HybridResponse) => void,
    ) => {
      const workloadName = options.config.remoteWorkloadName;
      const workloadModulePath = options.config.remoteWorkloadModulePath;
      const workload = (await Workload.instantiate(
        workloadName,
        workloadModulePath,
        WorkloadType.remoteServer,
        { connectionIdentifier, options, websocketConnectionHandler },
      )) as BrokerWorkload;

      const data: RemoteServerWorkloadRuntimeParams = {
        payload,
        websocketHandler: emit,
      };
      await workload.handler(data);
    };
};
