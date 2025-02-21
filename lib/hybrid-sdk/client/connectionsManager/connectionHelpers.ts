import { WebSocketConnection } from '../types/client';

export const shutDownConnectionPair = (
  websocketConnections: WebSocketConnection[],
  connectionIndex: number,
) => {
  const friendlyName = websocketConnections[connectionIndex].friendlyName;
  websocketConnections[connectionIndex].end();
  websocketConnections[connectionIndex].destroy();
  websocketConnections.splice(connectionIndex, 1);
  const secondTunnelIndex = websocketConnections.findIndex(
    (websocketConnection) => websocketConnection.friendlyName == friendlyName,
  );
  websocketConnections[secondTunnelIndex].end();
  websocketConnections[secondTunnelIndex].destroy();
  websocketConnections.splice(secondTunnelIndex, 1);

  //TODO: Clean up plugins elements (intervals, etc)
};
