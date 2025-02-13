import { NextFunction, Request, Response } from 'express';
import { log as logger } from '../../logs/logger';
import { getDesensitizedToken } from '../utils/token';
import { getSocketConnections } from '../socket';
import { incrementHttpRequestsTotal } from '../../common/utils/metrics';
import { hostname } from 'node:os';
import { makeStreamingRequestToDownstream } from '../../hybrid-sdk/http/request';
import { PostFilterPreparedRequest } from '../../common/relay/prepareRequest';
import { URL, URLSearchParams } from 'node:url';

export const overloadHttpRequestWithConnectionDetailsMiddleware = async (
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
      !process.env.BROKER_SERVER_MANDATORY_AUTH_ENABLED &&
      localHostname &&
      localHostname.endsWith('-1') &&
      localHostname.match(regex)
    ) {
      const url = new URL(`http://${req.hostname}${req.url}`);
      url.hostname = req.hostname.replace(/-[0-9]{1,2}\./, '.');
      url.searchParams.append('connection_role', 'primary');

      const postFilterPreparedRequest: PostFilterPreparedRequest = {
        url: url.toString(),
        headers: req.headers,
        method: req.method,
      };
      if (
        req.method == 'POST' ||
        req.method == 'PUT' ||
        req.method == 'PATCH'
      ) {
        postFilterPreparedRequest.body = req.body;
      }
      logger.debug(
        { url: req.url, method: req.method },
        'Making request to primary',
      );
      try {
        const httpResponse = await makeStreamingRequestToDownstream(
          postFilterPreparedRequest,
        );
        res.writeHead(httpResponse.statusCode ?? 500, httpResponse.headers);
        return httpResponse.pipe(res);
      } catch (err) {
        logger.error({ err }, `Error in HTTP middleware: ${err}`);
        res.setHeader('x-broker-failure', 'error-forwarding-to-primary');
        return res.status(500).send('Error forwarding request to primary.');
      }
    } else {
      logger.warn({ desensitizedToken }, 'no matching connection found');
      res.setHeader('x-broker-failure', 'no-connection');
      return res.status(404).json({ ok: false });
    }
  }
  // Grab a first (newest) client from the pool
  // This is really silly...
  res.locals.websocket = connections.get(token)![0].socket;
  res.locals.socketVersion = connections.get(token)![0].socketVersion;
  res.locals.capabilities = connections.get(token)![0].metadata.capabilities;
  res.locals.brokerAppClientId =
    connections.get(token)![0].brokerAppClientId ?? '';
  req['locals'] = {};
  req['locals']['capabilities'] =
    connections.get(token)![0].metadata.capabilities;
  // strip the leading url
  req.url = req.url.slice(`/broker/${token}`.length);
  if (req.url.includes('connection_role')) {
    const urlParts = req.url.split('?');
    if (urlParts.length > 1) {
      const params = new URLSearchParams(urlParts[1]);
      params.delete('connection_role');
      req.url =
        params.size > 0 ? `${urlParts[0]}?${params.toString()}` : urlParts[0];
    }
  }

  logger.debug({ url: req.url }, 'request');
  next();
};
