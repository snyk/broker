import { log as logger } from '../../../logs/logger';
import { getConfig } from '../../common/config/config';
import { NextFunction, Request, Response } from 'express';
import { WebSocketConnection, Role } from '../types/client';
import { isWebsocketConnOpen } from '../utils/socketHelpers';
import { maskToken } from '../../common/utils/token';

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
        logger.warn(
          { url: req.path, requestId: req.requestId },
          'Unexpected type in webhook request.',
        );
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
      // Container registry requests. Route by connection identifier so that
      // multiple CR connections of the same type within one org resolve to the
      // correct connection. The identifier is set server-side by BrokerWorkload
      // (snyk-broker-connection-identifier header). Falls back to type-based
      // routing for backwards compatibility (legacy / single-CR setups) when a
      // single unique CRA-compatible connection exists.
      const connectionIdentifier = req.headers[
        'snyk-broker-connection-identifier'
      ] as string;

      const craCompatibleTypeNames = config.CRA_COMPATIBLE_TYPES as string[];
      const craCompatibleConnections = websocketConnections.filter((conn) =>
        craCompatibleTypeNames.includes(conn.supportedIntegrationType),
      );

      // Each connection has primary and secondary roles, so count unique
      // identifiers rather than raw connection entries.
      const uniqueCraCompatibleIdentifiers = new Set(
        craCompatibleConnections.map((conn) => conn.identifier),
      );

      let selectedWebsocketConnection: WebSocketConnection | undefined;

      if (connectionIdentifier) {
        // Identifier-based routing (request originated from the server).
        selectedWebsocketConnection = websocketConnections.find(
          (conn) => conn.identifier === connectionIdentifier,
        );

        if (!selectedWebsocketConnection) {
          logger.error(
            {
              connectionIdentifier: maskToken(connectionIdentifier),
              url: req.path,
              requestId: req.requestId,
            },
            'no websocket connection found for container registry request identifier',
          );
          res.status(404).send('connection not found for identifier');
          return;
        }

        if (
          !craCompatibleTypeNames.includes(
            selectedWebsocketConnection.supportedIntegrationType,
          )
        ) {
          logger.error(
            {
              connectionIdentifier: maskToken(connectionIdentifier),
              type: selectedWebsocketConnection.supportedIntegrationType,
              url: req.path,
              requestId: req.requestId,
            },
            'connection found but type is not CRA-compatible',
          );
          res
            .status(400)
            .send(
              'Connection type not compatible with container registry requests.',
            );
          return;
        }
      } else {
        // Fallback to type-based routing when the identifier header is missing.
        // Supports backwards compatibility for requests from behind the client
        // and legacy single-CR setups. Only safe with exactly one unique
        // CRA-compatible connection identifier.
        if (uniqueCraCompatibleIdentifiers.size === 0) {
          logger.error(
            { url: req.path, requestId: req.requestId },
            'No CRA-compatible connections available for container registry request',
          );
          res.status(404).send('no CRA-compatible connection available');
          return;
        }

        if (uniqueCraCompatibleIdentifiers.size === 1) {
          // Single unique connection identifier: use the primary connection
          // (backwards compatibility).
          const connectionId = Array.from(uniqueCraCompatibleIdentifiers)[0];
          selectedWebsocketConnection =
            craCompatibleConnections.find(
              (conn) =>
                conn.identifier === connectionId && conn.role === Role.primary,
            ) ||
            craCompatibleConnections.find(
              (conn) => conn.identifier === connectionId,
            );
        } else {
          // Multiple unique connection identifiers but no identifier header:
          // cannot safely route.
          logger.error(
            {
              url: req.path,
              requestId: req.requestId,
              availableConnections: uniqueCraCompatibleIdentifiers.size,
            },
            'Container registry request missing connection identifier header and multiple CRA-compatible connections exist',
          );
          res
            .status(400)
            .send(
              'missing connection identifier (multiple CRA-compatible connections)',
            );
          return;
        }
      }

      res.locals.websocket = selectedWebsocketConnection;
      next();
      return;
    } else {
      logger.error(
        { url: req.path, requestId: req.requestId },
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
