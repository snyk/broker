import { Request, Response } from 'express';
import version from '../../common/utils/version';

enum connectionStates {
  OPENING = 1, // Only here for primus.js readyState number compatibility.
  CLOSED = 2, // The connection is closed.
  OPEN = 3, // The connection is open.
}

export const healthCheckHandler =
  // io is available in res.locals.io
  (req: Request, res: Response) => {
    // healthcheck state depends on websocket connection status
    const isConnOpen = res.locals.io.readyState === connectionStates.OPEN;
    const status = isConnOpen ? 200 : 500;
    const data = {
      ok: isConnOpen,
      websocketConnectionOpen: isConnOpen,
      brokerServerUrl: res.locals.io.url.href,
      version,
      transport: res.locals.io.socket.transport.name,
    };

    return res.status(status).json(data);
  };
