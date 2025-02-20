import { Request, Response } from 'express';
import version from '../../common/utils/version';
import { WebSocketConnection } from '../types/client';
import { maskToken } from '../../common/utils/token';

interface healthcheckData {
  ok: boolean;
  identifier?: string;
  websocketConnectionOpen: boolean;
  brokerServerUrl: string;
  version: string;
  transport: string;
}
import { isWebsocketConnOpen } from '../utils/socketHelpers';

export const healthCheckHandler =
  // io is available in res.locals.websocket
  (req: Request, res: Response) => {
    const websocketConnsArray = res.locals
      .websocketConnections as WebSocketConnection[];
    const data: healthcheckData[] = [];
    // const statuses: Array<number> = [];
    const statusesMap: Map<string, number> = new Map<string, number>();
    for (let i = 0; i < websocketConnsArray.length; i++) {
      const isConnOpen = isWebsocketConnOpen(websocketConnsArray[i]);
      // statuses.push(isConnOpen ? 200 : 500);
      const tunnelData = {
        ok: isConnOpen,
        websocketConnectionOpen: isConnOpen,
        brokerServerUrl: websocketConnsArray[i].url.href,
        version,
        transport: websocketConnsArray[i].socket.transport.name,
      };
      if (
        websocketConnsArray[i].identifier &&
        websocketConnsArray[i].identifier!.indexOf('-...-') < 0
      ) {
        tunnelData['identifier'] = maskToken(
          websocketConnsArray[i].identifier ?? '',
        );
        tunnelData['friendlyName'] = websocketConnsArray[i].friendlyName ?? '';
      }
      data.push(tunnelData);
      if (statusesMap.get(tunnelData['identifier']) !== 200) {
        //return healthy if at least one tunnel is open for identifier
        statusesMap.set(tunnelData['identifier'], isConnOpen ? 200 : 500);
      }
    }
    const statuses = [...statusesMap.values()];
    // healthcheck state depends on websocket connection status
    // value of primus.Spark.OPEN means the websocket connection is open
    return res
      .status(statuses.some((status) => status == 500) ? 500 : 200)
      .json(data.length == 1 ? data[0] : data); // So we don't break current
  };
