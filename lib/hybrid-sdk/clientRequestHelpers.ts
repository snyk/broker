import { Request, Response } from 'express';
import { log as logger } from '../logs/logger';
import { getConfig } from '../common/config/config';

import {
  incrementWebSocketRequestsTotal,
  observeResponseSize,
  incrementUnableToSizeResponse,
} from '../common/utils/metrics';
import undefsafe from 'undefsafe';
import { ExtendedLogContext } from '../common/types/log';
import { v4 as uuid } from 'uuid';
import stream from 'stream';
import { streamsStore } from './http/server-post-stream-handler';
import { maskToken } from '../common/utils/token';
import { makeRequestToDownstream } from './http/request';

export class HybridClientRequestHandler {
  logContext: ExtendedLogContext;
  simplifiedContext: ExtendedLogContext;
  options;
  req: Request;
  res: Response;
  responseWantedOverWs: boolean;

  constructor(req: Request, res: Response) {
    this.req = req;
    this.res = res;
    this.options = getConfig();

    this.req.headers['snyk-request-id'] ||= uuid();
    this.responseWantedOverWs = req.headers['x-broker-ws-response']
      ? true
      : false;
    this.logContext = {
      url: this.req.url,
      requestMethod: this.req.method,
      requestHeaders: this.req.headers,
      requestId:
        this.req.headers['snyk-request-id'] &&
        Array.isArray(this.req.headers['snyk-request-id'])
          ? this.req.headers['snyk-request-id'].join(',')
          : this.req.headers['snyk-request-id'] || '',
      maskedToken: this.req['maskedToken'],
      hashedToken: this.req['hashedToken'],
      actingOrgPublicId: this.req.headers[
        'snyk-acting-org-public-id'
      ] as string,
      actingGroupPublicId: this.req.headers[
        'snyk-acting-group-public-id'
      ] as string,
      productLine: this.req.headers['snyk-product-line'] as string,
      flow: this.req.headers['snyk-flow-name'] as string,
    };

    this.simplifiedContext = this.logContext;
    delete this.simplifiedContext.requestHeaders;
    logger.info(this.simplifiedContext, '[HTTP Flow] Received request');
  }
  private makeWebsocketRequestWithStreamingResponse() {
    const streamingID = uuid();
    const streamBuffer = new stream.PassThrough({ highWaterMark: 1048576 });
    streamBuffer.on('error', (error) => {
      // This may be a duplicate error, as the most likely cause of this is the POST handler calling destroy.
      logger.error(
        {
          ...this.logContext,
          error,
          stackTrace: new Error('stacktrace generator').stack,
        },
        '[HTTP Flow][Relay] Error piping POST response stream through to HTTP response',
      );
      this.res.destroy(error);
    });
    this.logContext.streamingID = streamingID;
    logger.debug(
      this.logContext,
      '[HTTP Flow][Relay] Sending request over websocket connection expecting POST stream response',
    );

    streamsStore.set(streamingID, {
      response: this.res,
      streamBuffer,
      streamSize: 0,
      brokerAppClientId: this.res.locals.brokerAppClientId ?? null,
    });
    streamBuffer.pipe(this.res);
    const simplifiedContextWithStreamingID = this.simplifiedContext;
    simplifiedContextWithStreamingID['streamingID'] = streamingID;
    logger.info(
      simplifiedContextWithStreamingID,
      '[HTTP Flow] Brokering request through WS',
    );
    this.res.locals.websocket.send('request', {
      url: this.req.url,
      method: this.req.method,
      body: this.req.body,
      headers: this.req.headers,
      streamingID,
    });
    incrementWebSocketRequestsTotal(false, 'outbound-request');
    return;
  }
  private makeWebsocketRequestWithWebsocketResponse() {
    logger.debug(
      this.logContext,
      '[HTTP Flow][Relay] Sending request over websocket connection expecting Websocket response',
    );

    logger.info(
      this.simplifiedContext,
      '[HTTP Flow] Brokering request through WS',
    );
    // relay the http request over the websocket, handle websocket response
    this.res.locals.websocket.send(
      'request',
      {
        url: this.req.url,
        method: this.req.method,
        body: this.req.body,
        headers: this.req.headers,
        streamingID: '',
      },
      (ioResponse) => {
        this.logContext.responseStatus = ioResponse.status;
        this.logContext.responseHeaders = ioResponse.headers;
        this.logContext.responseBodyType = typeof ioResponse.body;

        const logMsg =
          '[HTTP Flow][Relay] Return response from Websocket back to HTTP connection';
        if (ioResponse.status <= 299) {
          logger.debug(this.logContext, logMsg);
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
          this.logContext.ioErrorType = ioResponse.errorType;
          this.logContext.ioOriginalBodySize = ioResponse.originalBodySize;
          logger.warn(this.logContext, errorLogMsg);
        }

        const httpResponse = this.res
          .status(ioResponse.status)
          .set(ioResponse.headers);

        const encodingType = undefsafe(ioResponse, 'headers.transfer-encoding');
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
              ...this.logContext,
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
  }
  private makeHttpRequest() {
    const apiDomain = new URL(
      this.options.API_BASE_URL ||
        (this.options.BROKER_SERVER_URL
          ? this.options.BROKER_SERVER_URL.replace('//broker.', '//api.')
          : 'https://api.snyk.io'),
    );

    const requestUri = new URL(this.req.url, apiDomain);
    this.req.headers['host'] = requestUri.host;
    this.req.headers['x-snyk-broker'] = `${maskToken(
      this.res.locals.websocket.identifier, // This should be coupled/replaced by deployment ID
    )}`;

    const filteredReq = {
      url: requestUri.toString(),
      method: this.req.method,
      body: this.req.body,
      headers: this.req.headers,
    };

    makeRequestToDownstream(filteredReq)
      .then((resp) => {
        if (resp.statusCode) {
          this.res.status(resp.statusCode).set(resp.headers).send(resp.body);
        } else {
          this.res.status(500).send(resp.statusText);
        }
      })
      .catch((err) => {
        logger.error(
          this.logContext,
          err,
          'Failed to forward webhook event to Snyk Platform',
        );
      });
  }

  makeRequest(filterResponse, makeRequestOverHttp = false) {
    this.req.url = filterResponse.url;
    this.logContext.ioUrl = filterResponse.url;
    if (makeRequestOverHttp) {
      this.makeHttpRequest();
    } else if (
      this.res?.locals?.capabilities?.includes('post-streams') &&
      !this.responseWantedOverWs
    ) {
      this.makeWebsocketRequestWithStreamingResponse();
    } else {
      this.makeWebsocketRequestWithWebsocketResponse();
    }
  }
}
