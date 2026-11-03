import { log as logger } from '../../../logs/logger';
import { getConfig } from '../../common/config/config';
import { NextFunction, Request, Response } from 'express';
import { WebSocketConnection } from '../types/client';
import { isWebsocketConnOpen } from '../utils/socketHelpers';
import {
  craConnectionQueryParameter,
  getCraConnections,
} from '../../common/utils/craCallbackRouting';
import { hashToken } from '../../common/utils/token';

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
      req.path.startsWith('/v2/') ||
      req.path === '/rest/scan/result'
    ) {
      const queryIndex = req.url.indexOf('?');
      const queryComponents =
        queryIndex === -1 ? [] : req.url.slice(queryIndex + 1).split('&');
      const selectors = queryComponents.flatMap((component) =>
        new URLSearchParams(`?${component}`).getAll(
          craConnectionQueryParameter,
        ),
      );
      const eligibleConnections = getCraConnections(config);
      if (
        selectors.length > 1 ||
        (selectors.length === 1 && !/^[a-f0-9]{64}$/.test(selectors[0]))
      ) {
        logger.warn(
          {
            requestId: req.requestId,
            reasonCode: 'cra_callback_invalid_selector',
          },
          'Rejected container registry callback routing request.',
        );
        res.status(400).send('Invalid container registry callback connection.');
        return;
      }
      const matchingConnections = selectors.length
        ? eligibleConnections.filter(
            (connection) =>
              connection.identifier &&
              hashToken(connection.identifier) === selectors[0],
          )
        : eligibleConnections;
      if (selectors.length && matchingConnections.length === 0) {
        logger.warn(
          {
            requestId: req.requestId,
            reasonCode: 'cra_callback_connection_not_found',
          },
          'Rejected container registry callback routing request.',
        );
        res
          .status(404)
          .send('Container registry callback connection not found.');
        return;
      }
      if (matchingConnections.length === 0) {
        logger.warn(
          {
            requestId: req.requestId,
            reasonCode: 'cra_callback_no_compatible_connection',
          },
          'Rejected container registry callback routing request.',
        );
        res
          .status(505)
          .send(
            'Current Broker Client configuration does not support this flow. Missing container registry agent compatible connection.',
          );
        return;
      }
      if (matchingConnections.length !== 1) {
        logger.warn(
          {
            requestId: req.requestId,
            reasonCode: 'cra_callback_ambiguous_connection',
          },
          'Rejected container registry callback routing request.',
        );
        res
          .status(400)
          .send('Ambiguous container registry callback connection.');
        return;
      }
      const selectedConnection = websocketConnections.find(
        (connection) =>
          !matchingConnections[0].isDisabled &&
          connection.identifier === matchingConnections[0].identifier &&
          connection.supportedIntegrationType === matchingConnections[0].type &&
          isWebsocketConnOpen(connection),
      );
      if (!selectedConnection) {
        logger.warn(
          {
            requestId: req.requestId,
            reasonCode: 'cra_callback_connection_unavailable',
          },
          'Rejected container registry callback routing request.',
        );
        res
          .status(503)
          .send('Container registry callback connection unavailable.');
        return;
      }
      if (selectors.length) {
        const remainingComponents = queryComponents.filter(
          (component) =>
            !new URLSearchParams(`?${component}`).has(
              craConnectionQueryParameter,
            ),
        );
        req.url =
          req.url.slice(0, queryIndex) +
          (remainingComponents.length
            ? `?${remainingComponents.join('&')}`
            : '');
      }
      res.locals.websocket = selectedConnection;
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
