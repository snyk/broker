import primus from 'primus';
import { WebSocketConnection } from '../types/client';

export const isWebsocketConnOpen = (io: WebSocketConnection) => {
  return io.readyState === primus.Spark.OPEN;
};
