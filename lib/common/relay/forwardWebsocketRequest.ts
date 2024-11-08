import { RequestPayload } from '../types/http';
import { WebSocketConnection } from '../../client/types/client';
import { LoadedClientOpts, LoadedServerOpts } from '../types/options';
import { brokerWorkload } from '../broker-workload';

export const forwardWebSocketRequest = (
  options: LoadedClientOpts | LoadedServerOpts,
  websocketConnectionHandler: WebSocketConnection,
) => {
  // 1. Request coming in over websocket conn (logged)
  // 2. Filter for rule match (log and block if no match)
  // 3. Relay over HTTP conn (logged)
  // 4. Get response over HTTP conn (logged)
  // 5. Send response over websocket conn

  return (connectionIdentifier) => async (payload: RequestPayload, emit) => {
    const workload = new brokerWorkload(
      connectionIdentifier,
      options,
      websocketConnectionHandler,
    );
    await workload.handler(payload, emit);
  };
};
