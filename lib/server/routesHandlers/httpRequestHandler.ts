import { NextFunction, Request, Response } from 'express';
import { log as logger } from '../../logs/logger';
import { getDesensitizedToken } from '../utils/token';
import { getConnections } from '../socket';
import { incrementHttpRequestsTotal } from '../../common/utils/metrics';

export const overloadHttpRequestWithConnectionDetailsMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const connections = getConnections();
  const token = req.params.token;
  const desensitizedToken = getDesensitizedToken(token);
  req['maskedToken'] = desensitizedToken.maskedToken;
  req['hashedToken'] = desensitizedToken.hashedToken;

  // check if we have this broker in the connections
  if (!connections.has(token)) {
    incrementHttpRequestsTotal(false);
    logger.warn({ desensitizedToken }, 'no matching connection found');
    return res.status(404).json({ ok: false });
  }

  // Grab a first (newest) client from the pool
  // This is really silly...
  res.locals.io = connections.get(token)[0].socket;
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
