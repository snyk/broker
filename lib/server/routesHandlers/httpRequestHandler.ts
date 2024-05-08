import { NextFunction, Request, Response } from 'express';
import { log as logger } from '../../logs/logger';
import { getDesensitizedToken } from '../utils/token';
import { getSocketConnections } from '../socket';
import { incrementHttpRequestsTotal } from '../../common/utils/metrics';
import { hostname } from 'node:os';

export const overloadHttpRequestWithConnectionDetailsMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const connections = getSocketConnections();
  const token = req.params.token;
  const desensitizedToken = getDesensitizedToken(token);
  req['maskedToken'] = desensitizedToken.maskedToken;
  req['hashedToken'] = desensitizedToken.hashedToken;
  // check if we have this broker in the connections
  if (!connections.has(token)) {
    incrementHttpRequestsTotal(true, 'inbound-request');
    const localHostname = hostname();
    const regex = new RegExp(/-[0-9]{1,2}-[0-1]/);
    if (
      localHostname &&
      localHostname.endsWith('-1') &&
      localHostname.match(regex)
    ) {
      logger.debug({}, 'redirecting to primary');
      const url = new URL(`http://${req.host}${req.url}`);
      url.searchParams.append('connection_role', 'primary');
      return res.redirect(url.toString());
    } else {
      logger.warn({ desensitizedToken }, 'no matching connection found');
      return res.status(404).json({ ok: false });
    }
  }

  // Grab a first (newest) client from the pool
  // This is really silly...
  res.locals.websocket = connections.get(token)[0].socket;
  res.locals.socketVersion = connections.get(token)[0].socketVersion;
  res.locals.capabilities = connections.get(token)[0].metadata.capabilities;
  req['locals'] = {};
  req['locals']['capabilities'] =
    connections.get(token)[0].metadata.capabilities;

  // strip the leading url
  req.url = req.url.slice(`/broker/${token}`.length);
  logger.debug({ url: req.url }, 'request');

  next();
};
