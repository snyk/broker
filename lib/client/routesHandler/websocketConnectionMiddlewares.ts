import { log as logger } from '../../logs/logger';
import { getConfig } from '../../common/config/config';
import { NextFunction, Request, Response } from 'express';
import { WebSocketConnection } from '../types/client';

export const websocketConnectionSelectorMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const config = getConfig();
  if (!config.universalBrokerEnabled) {
    res.locals.websocket = res.locals.websocketConnections[0];
    next();
  } else {
    const websocketConnections = res.locals
      .websocketConnections as WebSocketConnection[];
    let inboundRequestType = '';
    //config.supportedBrokerTypes

    // 2 cases: webhooks/TYPE, /v[1-2] Container registry.
    if (req.path.startsWith('/webhook')) {
      const splitUrl = req.path.split('/');
      if (
        splitUrl.length > 2 &&
        config.supportedBrokerTypes.includes(splitUrl[2])
      ) {
        inboundRequestType = req.path.split('/')[2];
      } else {
        logger.warn({ url: req.path }, 'Unexpected type in webhook request');
      }
    } else if (
      req.path.startsWith('/api/v1/') ||
      req.path.startsWith('/api/v2/') ||
      req.path.startsWith('/v1/') ||
      req.path.startsWith('/v2/')
    ) {
      inboundRequestType = 'container-registry-agent';
    } else {
      logger.error(
        { url: req.path },
        'Unknown type in client->server request.',
      );

      if (config.serviceEnv == 'universaltest') {
        // only to support testing, blocking all other unknown request types
        inboundRequestType =
          websocketConnections.length > 0
            ? websocketConnections[0].supportedIntegrationType
            : '';
      } else {
        res
          .status(401)
          .send('Unknown request type, unable to forward to server.');
        return;
      }
    }

    const selectedWebsocketConnection = websocketConnections.find(
      (conn) => conn.supportedIntegrationType == inboundRequestType,
    );
    res.locals.websocket = selectedWebsocketConnection;
    next();
  }
};
