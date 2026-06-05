import { NextFunction, Request, Response } from 'express';
import { log as logger } from '../../../logs/logger';
import { getDesensitizedToken } from '../utils/token';
import { ClientSocket, getSocketConnections } from '../socket';
import { incrementHttpRequestsTotal } from '../../common/utils/metrics';
import { hostname } from 'node:os';
import { URL, URLSearchParams } from 'node:url';
import { PostFilterPreparedRequest } from '../../../broker-workload/prepareRequest';
import { makeStreamingRequestToDownstream } from '../../http/request';
import { retry } from '../../http/exponential-backoff';

// When no connection is ready yet, a client may still be completing its
// handshake during a (re)connect. Retry a few times with exponential backoff to
// let it become ready and serve the request transparently, rather than failing
// back to the caller (bare git does not retry). Tunable via env for ops.
const CONNECTION_READY_MAX_RETRIES = Number(
  process.env.BROKER_CONNECTION_READY_MAX_RETRIES ?? 4,
);

export const overloadHttpRequestWithConnectionDetailsMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const connections = getSocketConnections();
  const token = req.params.token;
  const desensitizedToken = getDesensitizedToken(token);
  const requestId = req.requestId;
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
        requestId: req.requestId,
      };
      if (
        req.method == 'POST' ||
        req.method == 'PUT' ||
        req.method == 'PATCH'
      ) {
        postFilterPreparedRequest.body = req.body;
      }
      logger.debug(
        { url: req.url, method: req.method, requestId },
        'Making request to primary',
      );
      try {
        // deepcode ignore Ssrf: request URL comes from the filter response, with the origin url being injected by the filtered version
        const httpResponse = await makeStreamingRequestToDownstream(
          postFilterPreparedRequest,
        );
        res.writeHead(httpResponse.statusCode ?? 500, httpResponse.headers);
        return httpResponse.pipe(res);
      } catch (err) {
        logger.error({ err, requestId }, `Error in HTTP middleware: ${err}`);
        res.setHeader('x-broker-failure', 'error-forwarding-to-primary');
        return res.status(500).send('Error forwarding request to primary.');
      }
    } else {
      logger.warn(
        { desensitizedToken, requestId },
        'No matching connection found.',
      );
      res.setHeader('x-broker-failure', 'no-connection');
      return res.status(404).json({ ok: false });
    }
  }
  // Grab the pool of connections for this token
  const connection = connections.get(token)!;
  // Make sure a connection actually exists before proceeding
  if (connection.length === 0) {
    logger.warn(
      { desensitizedToken, requestId },
      'No connection in pool found.',
    );
    res.setHeader('x-broker-failure', 'no-connection');
    return res.status(404).json({ ok: false });
  }
  const isReady = (c: ClientSocket): boolean =>
    Boolean(c.socket && c.metadata?.version && c.metadata?.capabilities);

  // The pool is newest-first, so find() returns the newest fully-ready
  // connection. This keeps HA clients immune to reconnect churn, which will
  // briefly create a not-yet-ready connection. If none is ready yet but a connection is still
  // completing its handshake, retry with exponential backoff. A permanently-incomplete pool
  // won't become ready, so return without retrying.
  let client: ClientSocket | undefined;
  try {
    client = await retry<ClientSocket | undefined>(
      () => {
        const pool = connections.get(token) ?? [];
        const ready = pool.find(isReady);
        if (ready) {
          return ready;
        }
        if (pool.some((c) => !c.socket || !c.metadata)) {
          throw new Error('client handshake in progress');
        }
        return undefined;
      },
      {
        retries: CONNECTION_READY_MAX_RETRIES,
        operation: 'await-ready-broker-connection',
      },
    );
  } catch {
    // Retries exhausted while a handshake was still in progress — a genuinely
    // slow or stuck (re)connect. Transient, so signal it is safe to retry.
    logger.error(
      { desensitizedToken, requestId },
      'No ready connection after retries (client handshake still in progress).',
    );
    res.setHeader('x-broker-failure', 'connection-not-ready');
    res.setHeader('Retry-After', '1');
    return res.status(503).json({ ok: false });
  }

  if (!client) {
    // Connections are present but missing required metadata (e.g. a legacy
    // client that never sends capabilities) — permanent for this client, so keep
    // the fast-fail 400 to avoid turning these into retry storms.
    logger.error(
      { desensitizedToken, requestId },
      'Connection metadata is missing required properties (version or capabilities).',
    );
    res.setHeader('x-broker-failure', 'bad-request');
    return res.status(400).json({ ok: false });
  }

  res.locals.websocket = client.socket;
  res.locals.socketVersion = client.socketVersion;
  res.locals.capabilities = client.metadata.capabilities;
  res.locals.clientVersion = client.metadata.version;
  res.locals.brokerAppClientId = client.brokerAppClientId ?? '';
  req['locals'] = {};
  req['locals']['capabilities'] = client.metadata.capabilities;

  const isServiceRequest = req.url.startsWith(`/service/${token}`);
  if (isServiceRequest) {
    req.headers['x-broker-service'] = 'true';
  }
  // strip the leading url
  req.url = isServiceRequest
    ? req.url.slice(`/service/${token}`.length)
    : req.url.slice(`/broker/${token}`.length);

  if (req.url.includes('connection_role')) {
    const urlParts = req.url.split('?');
    if (urlParts.length > 1) {
      const params = new URLSearchParams(urlParts[1]);
      params.delete('connection_role');
      req.url =
        params.size > 0 ? `${urlParts[0]}?${params.toString()}` : urlParts[0];
    }
  }

  logger.debug({ url: req.url, requestId }, 'request');
  next();
};

export const extractPossibleContextFromHttpRequestToHeader = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const requestId = req.requestId;
  try {
    const url = new URL(req.url, `${req.protocol}://${req.headers.host}`);
    const ctxPrefix = '/ctx/';
    const ctxIndex = url.pathname.indexOf(ctxPrefix);

    if (ctxIndex !== -1) {
      const ctxValueStart = ctxIndex + ctxPrefix.length;
      const ctxValueEnd = url.pathname.indexOf('/', ctxValueStart);

      if (ctxValueEnd === -1) {
        logger.error(
          { url, requestId },
          'Error processing URL for context extraction. Unexpected pattern.',
        );
        throw new Error(
          `Error processing URL for context extraction. Unexpected pattern in ${url}.`,
        );
      }

      const ctxValue = url.pathname.substring(ctxValueStart, ctxValueEnd);
      const newPathname =
        url.pathname.substring(0, ctxIndex) +
        url.pathname.substring(ctxValueEnd);

      if (newPathname === '') {
        logger.error(
          { url, requestId },
          'Error processing URL for context extraction. Unexpected empty pathname.',
        );
        throw new Error(
          `Error processing URL for context extraction. Unexpected empty pathname in url ${url}.`,
        );
      }

      url.pathname = newPathname;
      req.headers['x-snyk-broker-context-id'] = ctxValue;
      req.url = url.pathname + url.search;
    }
  } catch (error) {
    logger.error(
      { error, requestId },
      'Error processing URL for context extraction.',
    );
  }

  next();
};
