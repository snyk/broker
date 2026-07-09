import { Request, Response } from 'express';
import version from '../../common/utils/version';
import { WebSocketConnection } from '../types/client';
import { maskToken } from '../../common/utils/token';

export interface healthcheckData {
  ok: boolean;
  identifier?: string;
  friendlyName?: string;
  websocketConnectionOpen: boolean;
  brokerServerUrl: string;
  version: string;
  transport: string;
  degraded?: boolean;
  reestablishment?: 'reestablishing' | 'gave_up';
}
import { isWebsocketConnOpen } from '../utils/socketHelpers';
import { getReestablishmentState } from '../connectionsManager/reestablishment';

export const healthCheckHandler =
  // io is available in res.locals.websocket
  (req: Request, res: Response) => {
    const websocketConnsArray = res.locals
      .websocketConnections as WebSocketConnection[];
    const data: healthcheckData[] = [];
    const statusesMap: Map<string, number> = new Map<string, number>();
    for (let i = 0; i < websocketConnsArray.length; i++) {
      const isConnOpen = isWebsocketConnOpen(websocketConnsArray[i]);
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
    // Surface configured-but-missing connections (e.g. torn down by auth-renewal
    // exhaustion) — the pair is spliced out, so the loop above never sees them.
    let hasGaveUp = false;
    const configuredConnections = res.locals.clientOpts?.config?.connections as
      | Record<string, { identifier?: string; isDisabled?: boolean }>
      | undefined;
    if (configuredConnections) {
      const established = new Set(
        websocketConnsArray.map((conn) => conn.friendlyName),
      );
      for (const friendlyName of Object.keys(configuredConnections)) {
        const connection = configuredConnections[friendlyName];
        // Mirror the synchronizer: only enabled connections with a resolved
        // identifier are expected to be established.
        if (connection?.isDisabled || !connection?.identifier) {
          continue;
        }
        if (established.has(friendlyName)) {
          continue;
        }
        const reestablishment =
          getReestablishmentState(friendlyName) ?? 'reestablishing';
        if (reestablishment === 'gave_up') {
          hasGaveUp = true;
        }
        data.push({
          ok: false,
          websocketConnectionOpen: false,
          degraded: true,
          reestablishment,
          friendlyName,
          identifier: maskToken(connection.identifier),
          brokerServerUrl: '',
          version,
          transport: '',
        });
      }
    }

    const statuses = [...statusesMap.values()];
    // A gave_up connection forces 500 so the probe restarts the pod; otherwise
    // healthy (200) if at least one tunnel is open (Spark.OPEN), else 500.
    const httpStatus = hasGaveUp
      ? 500
      : statuses.some((status) => status == 200)
      ? 200
      : 500;
    return res.status(httpStatus).json(data.length == 1 ? data[0] : data); // So we don't break current
  };
