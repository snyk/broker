import { Request, Response } from 'express';
import undefsafe from 'undefsafe';

import { v4 as uuid } from 'uuid';

import { log as logger } from '../../logs/logger';
import stream from 'stream';
import {
  incrementHttpRequestsTotal,
  incrementUnableToSizeResponse,
  incrementWebSocketRequestsTotal,
  observeResponseSize,
} from '../utils/metrics';

import { streamsStore } from '../http/server-post-stream-handler';
import { ExtendedLogContext } from '../types/log';
import { LoadedClientOpts, LoadedServerOpts } from '../types/options';
import { LOADEDFILTERSET } from '../types/filter';
import { translateIntegrationTypeToBrokerIntegrationType } from '../../client/utils/integrations';

// 1. Request coming in over HTTP conn (logged)
// 2. Filter for rule match (log and block if no match)
// 3. Relay over websocket conn (logged)
// 4. Get response over websocket conn (logged)
// 5. Send response over HTTP conn
export const forwardHttpRequest = (
  options: LoadedClientOpts | LoadedServerOpts,
) => {
  // const filters = loadFilters(filterRules);

  return (req: Request, res: Response) => {
    // If this is the server, we should receive a Snyk-Request-Id header from upstream
    // If this is the client, we will have to generate one
    req.headers['snyk-request-id'] ||= uuid();
    const responseWantedOverWs = req.headers['x-broker-ws-response']
      ? true
      : false;
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

    const makeWebsocketRequestWithStreamingResponse = (result) => {
      req.url = result.url;
      logContext.ioUrl = result.url;

      const streamingID = uuid();
      const streamBuffer = new stream.PassThrough({ highWaterMark: 1048576 });
      streamBuffer.on('error', (error) => {
        // This may be a duplicate error, as the most likely cause of this is the POST handler calling destroy.
        logger.error(
          {
            ...logContext,
            error,
            stackTrace: new Error('stacktrace generator').stack,
          },
          '[HTTP Flow][Relay] Error piping POST response stream through to HTTP response',
        );
        res.destroy(error);
      });
      logContext.streamingID = streamingID;
      logger.debug(
        logContext,
        '[HTTP Flow][Relay] Sending request over websocket connection expecting POST stream response',
      );

      streamsStore.set(streamingID, {
        response: res,
        streamBuffer,
        streamSize: 0,
      });
      streamBuffer.pipe(res);
      const simplifiedContextWithStreamingID = simplifiedContext;
      simplifiedContextWithStreamingID['streamingID'] = streamingID;
      logger.info(
        simplifiedContextWithStreamingID,
        '[HTTP Flow] Brokering request through WS',
      );
      res.locals.websocket.send('request', {
        url: req.url,
        method: req.method,
        body: req.body,
        headers: req.headers,
        streamingID,
      });
      incrementWebSocketRequestsTotal(false, 'outbound-request');
      return;
    };
    const makeWebsocketRequestWithWebsocketResponse = (result) => {
      req.url = result.url;
      logContext.ioUrl = result.url;
      logger.debug(
        logContext,
        '[HTTP Flow][Relay] Sending request over websocket connection expecting Websocket response',
      );

      logger.info(
        simplifiedContext,
        '[HTTP Flow] Brokering request through WS',
      );
      // relay the http request over the websocket, handle websocket response
      res.locals.websocket.send(
        'request',
        {
          url: req.url,
          method: req.method,
          body: req.body,
          headers: req.headers,
          streamingID: '',
        },
        (ioResponse) => {
          logContext.responseStatus = ioResponse.status;
          logContext.responseHeaders = ioResponse.headers;
          logContext.responseBodyType = typeof ioResponse.body;

          const logMsg =
            '[HTTP Flow][Relay] Return response from Websocket back to HTTP connection';
          if (ioResponse.status <= 299) {
            logger.debug(logContext, logMsg);
            let responseBodyString = '';
            if (typeof ioResponse.body === 'string') {
              responseBodyString = ioResponse.body;
            } else if (typeof ioResponse.body === 'object') {
              responseBodyString = JSON.stringify(ioResponse.body);
            }
            if (responseBodyString) {
              const responseBodyBytes = Buffer.byteLength(
                responseBodyString,
                'utf-8',
              );
              observeResponseSize({
                bytes: responseBodyBytes,
                isStreaming: false,
              });
            } else {
              // fallback metric to let us know if we're recording all response sizes
              // we expect to remove this should it report 0
              incrementUnableToSizeResponse();
            }
          } else {
            const errorLogMsg =
              '[HTTP Flow][Relay] Non 2xx response from Websocket back to HTTP connection';
            logContext.ioErrorType = ioResponse.errorType;
            logContext.ioOriginalBodySize = ioResponse.originalBodySize;
            logger.warn(logContext, errorLogMsg);
          }

          const httpResponse = res
            .status(ioResponse.status)
            .set(ioResponse.headers);

          const encodingType = undefsafe(
            ioResponse,
            'headers.transfer-encoding',
          );
          try {
            // keep chunked http requests without content-length header
            if (encodingType === 'chunked') {
              httpResponse.write(ioResponse.body);
              httpResponse.end();
            } else {
              httpResponse.send(ioResponse.body);
            }
          } catch (err) {
            logger.error(
              {
                ...logContext,
                encodingType,
                err,
                stackTrace: new Error('stacktrace generator').stack,
              },
              '[HTTP Flow][Relay] Error forwarding response from Web Socket to HTTP connection',
            );
          }
        },
      );
      incrementWebSocketRequestsTotal(false, 'outbound-request');
    };
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
      if (
        res?.locals?.capabilities?.includes('post-streams') &&
        !responseWantedOverWs
      ) {
        makeWebsocketRequestWithStreamingResponse(filterResponse);
      } else {
        makeWebsocketRequestWithWebsocketResponse(filterResponse);
      }
    }
  };
};
