import { WebSocketConnection } from '../types/client';

export const identifyHandler = (serverData, websocket: WebSocketConnection) => {
  websocket.capabilities = serverData.capabilities;
};
