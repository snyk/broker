import { Primus } from 'primus';

export interface SocketHandler {
  websocket: WebSocketServer;
}

export interface WebSocketServer extends Primus {
  friendlyName?: string;
  options: {
    reconnect: any;
    ping: number;
    pong: number;
    timeout: number;
    transport: any;
    queueSize: any;
    stategy: any;
  };
  socketType: 'server';
  socketVersion?: number;

  // Added by primus-emitter plugin
  send: (event: string, ...args: any[]) => void;
}
