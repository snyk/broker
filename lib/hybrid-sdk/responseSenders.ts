import { BrokerServerPostResponseHandler } from './http/downstream-post-stream-to-server';
import { legacyStreaming } from './requestsHelper';
import { log as logger } from '../logs/logger';
import { IncomingMessage } from 'node:http';
import { logError, logResponse } from '../logs/log';
import { isJson } from '../common/utils/json';
import { replaceUrlPartialChunk } from '../common/utils/replace-vars';
import { RequestMetadata } from './types';

export interface HybridResponse {
  status: number;
  body?: any;
  headers?: any;
  errorType?: any;
  originalBodySize?: any;
}
export class HybridResponseHandler {
  connectionIdentifier;
  websocketConnectionHandler;
  logContext;
  config;
  requestMetadata: RequestMetadata;
  websocketResponseHandler;
  responseHandler;
  constructor(
    requestMetadata: RequestMetadata,
    websocketConnectionHandler,
    websocketResponseHandler,
    config,
    logContext,
  ) {
    this.logContext = logContext;
    this.websocketResponseHandler = websocketResponseHandler;
    this.config = config;
    this.connectionIdentifier = requestMetadata.connectionIdentifier;
    this.websocketConnectionHandler = websocketConnectionHandler;
    this.requestMetadata = requestMetadata;
    // WebsocketResponseHandler provided means WS response expected
    // header x-broker-ws-response:true used on server side
    if (
      this.websocketConnectionHandler?.capabilities?.includes(
        'receive-post-streams',
      ) &&
      !this.websocketResponseHandler
    ) {
      // Response Traffic over HTTP Post
      this.responseHandler = this.postDataResponseHandler;
    } else {
      // Response Traffic over WS
      this.responseHandler = this.websocketDataResponseHandler;
    }
  }

  // POST Data back without streaming
  sendResponse = (payload: HybridResponse) => {
    this.responseHandler(payload, false);
  };

  // POST Data back with streaming
  streamDataResponse = (payload: IncomingMessage) => {
    this.responseHandler(payload, true);
  };

  sendDataResponse = (response, logContext) => {
    const contentLength = response.body.length;
    // Note that the other side of the request will also check the length and will also reject it if it's too large
    // Set to 20MB even though the server is 21MB because the server looks at the total data travelling through the websocket,
    // not just the size of the body, so allow 1MB for miscellaneous data (e.g., headers, Primus overhead)

    const maxLength = parseInt(this.config.socketMaxResponseLength) || 20971520;
    if (contentLength && contentLength > maxLength) {
      const errorMessage = `body size of ${contentLength} is greater than max allowed of ${maxLength} bytes`;
      logError(logContext, {
        errorMessage,
      });
      return this.sendResponse({
        status: 502,
        errorType: 'BODY_TOO_LARGE',
        originalBodySize: contentLength,
        body: {
          message: errorMessage,
        },
      });
    }

    if (this.config.RES_BODY_URL_SUB && isJson(response.headers)) {
      const replaced = replaceUrlPartialChunk(response.body, null, this.config);
      response.body = replaced.newChunk;
    }
    const status = (response && response.statusCode) || 500;
    logResponse(logContext, status, response, this.config);
    this.sendResponse({
      status,
      body: response.body,
      headers: response.headers,
    });
  };

  private postDataResponseHandler = (
    responseData,
    streamingRequestData = false,
  ) => {
    try {
      this.logContext.requestMethod = '';
      this.logContext.requestHeaders = {};
      const postHandler = new BrokerServerPostResponseHandler(
        this.logContext,
        this.config,
        this.connectionIdentifier,
        this.websocketConnectionHandler?.serverId ?? '',
        this.requestMetadata.requestId,
        this.websocketConnectionHandler.role,
      );
      if (streamingRequestData) {
        // POST Streaming
        logger.debug(
          this.logContext,
          '[Websocket Flow] Posting HTTP streaming response back to Broker Server',
        );
        postHandler.forwardRequest(
          responseData,
          this.requestMetadata.payloadStreamingId,
        );
      } else {
        // POST Non Streaming
        logger.debug(
          this.logContext,
          '[Websocket Flow] Posting HTTP response back to Broker Server',
        );
        // Only for responses generated internally in the Broker Client/Server
        postHandler.sendData(
          responseData,
          this.requestMetadata.payloadStreamingId,
        );
      }
    } catch (err) {
      logger.error({ err }, `Error Posting via Emit callback.`);
    }
  };

  private websocketDataResponseHandler = (
    responseData,
    streamOverWebsocket = false,
  ) => {
    if (responseData) {
      responseData['headers'] = responseData['headers'] ?? {};
      responseData.headers['snyk-request-id'] = this.requestMetadata.requestId;
      responseData.headers['x-broker-ws-response'] =
        responseData.headers['x-broker-ws-response'] ?? 'true';
    }

    // Traffic over websockets
    if (this.requestMetadata.payloadStreamingId) {
      // Most likely not in use today
      if (streamOverWebsocket) {
        legacyStreaming(
          this.logContext,
          responseData,
          this.config,
          this.websocketConnectionHandler,
          this.requestMetadata.payloadStreamingId,
        );
      } else {
        this.websocketConnectionHandler?.send(
          'chunk',
          this.requestMetadata.payloadStreamingId,
          '',
          false,
          {
            status: responseData.status,
            headers: responseData.headers,
          },
        );
        this.websocketConnectionHandler?.send(
          'chunk',
          this.requestMetadata.payloadStreamingId,
          JSON.stringify(responseData.body),
          true,
        );
      }
    } else {
      // Used if x-broker-ws-response:true header on server side
      logger.debug(
        { ...this.logContext, responseData },
        '[Websocket Flow] (Legacy) Sending fixed response over WebSocket connection',
      );
      this.websocketResponseHandler(responseData);
    }
  };
}
