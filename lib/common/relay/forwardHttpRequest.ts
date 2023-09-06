import { Request, Response } from 'express';
import Filters from '../filter/filters';
import undefsafe from 'undefsafe';

import { v4 as uuid } from 'uuid';

import { log as logger } from '../../logs/logger';
import stream from 'stream';
import {
  incrementHttpRequestsTotal,
  incrementUnableToSizeResponse,
  observeResponseSize,
} from '../utils/metrics';

import { streamsStore } from '../http/downstream-stream';
import { LogContext } from '../types/log';
// 1. Request coming in over HTTP conn (logged)
// 2. Filter for rule match (log and block if no match)
// 3. Relay over websocket conn (logged)
// 4. Get response over websocket conn (logged)
// 5. Send response over HTTP conn
export const forwardHttpRequest = (filterRules) => {
  const filters = Filters(filterRules);

  return (req: Request, res: Response) => {
    // If this is the server, we should receive a Snyk-Request-Id header from upstream
    // If this is the client, we will have to generate one
    req.headers['snyk-request-id'] ||= uuid();
    const logContext: LogContext = {
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

    logger.info(logContext, 'received request over HTTP connection');
    filters(req, (error, result) => {
      if (error) {
        incrementHttpRequestsTotal(true);
        const reason =
          'Request does not match any accept rule, blocking HTTP request';
        error.reason = reason;
        logContext.error = error;
        logger.warn(logContext, reason);
        // TODO: respect request headers, block according to content-type
        return res
          .status(401)
          .send({ message: error.message, reason, url: req.url });
      }
      incrementHttpRequestsTotal(false);

      req.url = result.url;
      logContext.ioUrl = result.url;

      // check if this is a streaming request for binary data
      if (
        result.stream ||
        res?.locals?.capabilities?.includes('post-streams')
      ) {
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
            'caught error piping stream through to HTTP response',
          );
          res.destroy(error);
        });
        logContext.streamingID = streamingID;
        logger.debug(
          logContext,
          'sending stream request over websocket connection',
        );

        streamsStore.set(streamingID, {
          response: res,
          streamBuffer,
          streamSize: 0,
        });
        streamBuffer.pipe(res);

        res.locals.io.send('request', {
          url: req.url,
          method: req.method,
          body: req.body,
          headers: req.headers,
          streamingID,
        });

        return;
      }

      logger.debug(logContext, 'sending request over websocket connection');

      // relay the http request over the websocket, handle websocket response
      res.locals.io.send(
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

          const logMsg = 'sending response back to HTTP connection';
          if (ioResponse.status <= 200) {
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
            logContext.ioErrorType = ioResponse.errorType;
            logContext.ioOriginalBodySize = ioResponse.originalBodySize;
            logger.warn(logContext, logMsg);
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
              'error forwarding response from Web Socket to HTTP connection',
            );
          }
        },
      );
    });
  };
};
