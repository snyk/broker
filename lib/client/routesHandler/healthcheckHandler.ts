import { Request, Response } from 'express';
import version from '../../common/utils/version';
import { isWebsocketConnOpen } from '../utils/socketHelpers';

export const healthCheckHandler =
  // io is available in res.locals.io
  (req: Request, res: Response) => {
    // healthcheck state depends on websocket connection status
    // value of primus.Spark.OPEN means the websocket connection is open
    const isConnOpen = isWebsocketConnOpen(res.locals.io);
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
