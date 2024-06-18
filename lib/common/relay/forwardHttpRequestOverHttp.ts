import { Request, Response } from 'express';
import { v4 as uuid } from 'uuid';

import { log as logger } from '../../logs/logger';
import { incrementHttpRequestsTotal } from '../utils/metrics';

import { ExtendedLogContext } from '../types/log';
import { makeRequestToDownstream } from '../http/request';
import { maskToken } from '../utils/token';
import { LoadedClientOpts, LoadedServerOpts } from '../types/options';
import { LOADEDFILTERSET } from '../types/filter';
import { translateIntegrationTypeToBrokerIntegrationType } from '../../client/utils/integrations';

// 1. Request coming in over HTTP conn (logged)
// 2. Filter for rule match (log and block if no match)
// 3. Relay over websocket conn (logged)
// 4. Get response over websocket conn (logged)
// 5. Send response over HTTP conn
export const forwardHttpRequestOverHttp = (
  options: LoadedClientOpts | LoadedServerOpts,
  config,
) => {
  // const filters = loadFilters(filterRules);

  return (req: Request, res: Response) => {
    // If this is the server, we should receive a Snyk-Request-Id header from upstream
    // If this is the client, we will have to generate one
    req.headers['snyk-request-id'] ||= uuid();
    const logContext: ExtendedLogContext = {
      url: req.url,
      requestMethod: req.method,
      requestHeaders: req.headers,
      requestId:
        req.headers['snyk-request-id'] &&
        Array.isArray(req.headers['snyk-request-id'])
          ? req.headers['snyk-request-id'].join(',')
          : req.headers['snyk-request-id'] || '',
      maskedToken: req['maskedToken'],
      hashedToken: req['hashedToken'],
    };

    const simplifiedContext = logContext;
    delete simplifiedContext.requestHeaders;
    logger.info(simplifiedContext, '[HTTP Flow] Received request');
    let filterResponse;
    if (
      options.config.brokerType == 'client' &&
      options.config.universalBrokerEnabled
    ) {
      const clientOptions = options as LoadedClientOpts;
      const loadedFilters = clientOptions.loadedFilters as Map<
        string,
        LOADEDFILTERSET
      >;
      filterResponse =
        loadedFilters
          .get(
            translateIntegrationTypeToBrokerIntegrationType(
              res.locals.websocket.supportedIntegrationType,
              options.config,
            ),
          ) // The chosen type is determined by websocket connect middlwr
          ?.public(req) || false;
    } else {
      const loadedFilters = options.loadedFilters as LOADEDFILTERSET;
      filterResponse = loadedFilters.public(req);
    }

    if (!filterResponse) {
      incrementHttpRequestsTotal(true, 'inbound-request');
      const reason =
        'Request does not match any accept rule, blocking HTTP request';
      logContext.error = 'blocked';
      logger.warn(logContext, reason);
      // TODO: respect request headers, block according to content-type
      return res.status(401).send({ message: 'blocked', reason, url: req.url });
    } else {
      incrementHttpRequestsTotal(false, 'inbound-request');

      const apiDomain = new URL(
        config.API_BASE_URL ||
          (config.BROKER_SERVER_URL
            ? config.BROKER_SERVER_URL.replace('//broker.', '//api.')
            : 'https://api.snyk.io'),
      );

      const requestUri = new URL(req.url, apiDomain);
      req.headers['host'] = requestUri.host;
      req.headers['x-snyk-broker'] = `${maskToken(
        res.locals.websocket.identifier, // This should be coupled/replaced by deployment ID
      )}`;

      const filteredReq = {
        url: requestUri.toString(),
        method: req.method,
        body: req.body,
        headers: req.headers,
      };

      makeRequestToDownstream(filteredReq)
        .then((resp) => {
          if (resp.statusCode) {
            res.status(resp.statusCode).set(resp.headers).send(resp.body);
          } else {
            res.status(500).send(resp.statusText);
          }
        })
        .catch((err) => {
          logger.error(
            logContext,
            err,
            'Failed to forward webhook event to Snyk Platform',
          );
        });
    }
  };
};
