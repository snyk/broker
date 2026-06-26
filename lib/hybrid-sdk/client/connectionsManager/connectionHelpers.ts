import { WebSocketConnection } from '../types/client';

export const shutDownConnectionPair = (
  websocketConnections: WebSocketConnection[],
  connectionIndex: number,
) => {
  const clearAndStop = (connection: WebSocketConnection) => {
    if (connection.timeoutHandlerId) {
      clearTimeout(connection.timeoutHandlerId);
      connection.timeoutHandlerId = undefined;
    }
    connection.end();
    connection.destroy();
  };

  const primary = websocketConnections[connectionIndex];
  if (!primary) {
    return;
  }
  const friendlyName = primary.friendlyName;
  clearAndStop(primary);
  websocketConnections.splice(connectionIndex, 1);
  const secondTunnelIndex = websocketConnections.findIndex(
    (websocketConnection) => websocketConnection.friendlyName == friendlyName,
  );
  if (secondTunnelIndex !== -1) {
    clearAndStop(websocketConnections[secondTunnelIndex]);
    websocketConnections.splice(secondTunnelIndex, 1);
  }

  //TODO: Clean up plugins elements (intervals, etc)
};
