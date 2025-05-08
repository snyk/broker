import { log as logger } from '../../../logs/logger';
import { getConfig } from '../../common/config/config';
import { NextFunction, Request, Response } from 'express';
import { WebSocketConnection } from '../types/client';
import { isWebsocketConnOpen } from '../utils/socketHelpers';

export const websocketConnectionSelectorMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const config = getConfig();
  if (!config.universalBrokerEnabled) {
    res.locals.websocket = isWebsocketConnOpen(
      res.locals.websocketConnections[0],
    )
      ? res.locals.websocketConnections[0]
      : res.locals.websocketConnections[1];
    next();
  } else {
    const websocketConnections = res.locals
      .websocketConnections as WebSocketConnection[];
    const availableConnectionsTypes = websocketConnections.map(
      (x) => x.supportedIntegrationType,
    );
    let inboundRequestType = '';

    // 2 cases: webhooks/TYPE, /v[1-2] Container registry.
    if (req.path.startsWith('/webhook')) {
      const splitUrl = req.path.split('/');

      if (
        splitUrl.length > 2 &&
        availableConnectionsTypes.includes(splitUrl[2])
      ) {
        inboundRequestType = req.path.split('/')[2];
      } else if (
        splitUrl.length > 2 &&
        splitUrl[2] == 'github' &&
        availableConnectionsTypes.includes('github-enterprise')
      ) {
        inboundRequestType = 'github-enterprise';
      } else if (
        splitUrl.length > 2 &&
        splitUrl[2] == 'github' &&
        availableConnectionsTypes.includes('github-server-app')
      ) {
        inboundRequestType = 'github-server-app';
      } else if (
        splitUrl.length > 2 &&
        splitUrl[2] == 'github' &&
        availableConnectionsTypes.includes('github-cloud-app')
      ) {
        inboundRequestType = 'github-cloud-app';
      } else if (
        splitUrl.length > 2 &&
        splitUrl[2] == 'bitbucket-server' &&
        !availableConnectionsTypes.includes('bitbucket-server') &&
        availableConnectionsTypes.includes('bitbucket-server-bearer-auth')
      ) {
        inboundRequestType = 'bitbucket-server-bearer-auth';
      } else {
        logger.warn({ url: req.path }, 'Unexpected type in webhook request.');
        res
          .status(401)
          .send(
            'Unexpected type in webhook request, unable to forward to server.',
          );
        return;
      }
    } else if (
      req.path.startsWith('/api/v1/') ||
      req.path.startsWith('/api/v2/') ||
      req.path.startsWith('/v1/') ||
      req.path.startsWith('/v2/')
    ) {
      const craCompatibleAvailableTypes = getCraCompatibleTypes(config);
      if (craCompatibleAvailableTypes.length > 0) {
        inboundRequestType = craCompatibleAvailableTypes[0];
      } else {
        res
          .status(505)
          .send(
            'Current Broker Client configuration does not support this flow. Missing container registry agent compatible connection.',
          );
        return;
      }
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

export function getCraCompatibleTypes(config: Record<string, any>): string[] {
  const connectionsList = Object.values(config.connections) as Record<
    string,
    string
  >[];
  const craCompatibleTypeNames = config.CRA_COMPATIBLE_TYPES as string[];
  return connectionsList
    .filter((x) => x && craCompatibleTypeNames.includes(x.type))
    .map((x) => x.type);
}
