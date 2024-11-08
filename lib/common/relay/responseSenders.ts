import { getConfig } from '../config/config';
import { BrokerServerPostResponseHandler } from '../http/downstream-post-stream-to-server';
import {
  legacyStreaming,
  makeLegacyRequest,
  makePostStreamingRequest,
} from './requestsHelper';
import { log as logger } from '../../logs/logger';
import { CorrelationHeaders } from '../utils/correlation-headers';

export type RequestMetadata = {
  connectionIdentifier: string;
  payloadStreamingId: string;
  overHttp: boolean;
} & CorrelationHeaders;

export class HybridResponseHandler {
  connectionIdentifier;
  websocketConnectionHandler;
  logContext;
  options;
  requestMetadata: RequestMetadata;
  websocketResponseHandler;
  responseHandler;
  constructor(
    requestMetadata: RequestMetadata,
    websocketConnectionHandler,
    websocketResponseHandler,
    logContext,
  ) {
    this.logContext = logContext;
    this.websocketResponseHandler = websocketResponseHandler;
    this.options = getConfig();
    this.connectionIdentifier = requestMetadata.connectionIdentifier;
    this.websocketConnectionHandler = websocketConnectionHandler;
    this.requestMetadata = requestMetadata;
    if (
      this.websocketConnectionHandler?.capabilities?.includes(
        'receive-post-streams',
      ) &&
      !this.websocketResponseHandler
    ) {
      // Traffic over HTTP Post
      this.responseHandler = this.postOverrideEmit;
    } else {
      this.responseHandler = this.legacyOverrideEmit;
    }
  }

  sendResponse = (payload) => {
    this.responseHandler(payload);
  };
  sendDataResponseInternal = (payload) => {
    this.responseHandler(payload, this.requestMetadata.overHttp);
  };

  sendDataResponse = async (
    payloadStreamingId,
    preparedRequest,
    logContext,
  ) => {
    payloadStreamingId
      ? await makePostStreamingRequest(
          preparedRequest,
          this.sendDataResponseInternal,
          logContext,
        )
      : await makeLegacyRequest(
          preparedRequest,
          this.sendResponse,
          logContext,
          this.options,
        );
  };

  private postOverrideEmit = (responseData, replyOverHttp = false) => {
    try {
      this.logContext.requestMethod = '';
      this.logContext.requestHeaders = {};
      const postHandler = new BrokerServerPostResponseHandler(
        this.logContext,
        this.options,
        this.connectionIdentifier,
        this.options.universalBrokerEnabled
          ? this.websocketConnectionHandler?.serverId
          : this.options.serverId,
        this.requestMetadata.requestId,
        this.websocketConnectionHandler.role,
      );
      if (replyOverHttp) {
        logger.debug(
          this.logContext,
          '[Websocket Flow] Posting HTTP streaming response back to Broker Server',
        );
        postHandler.forwardRequest(
          responseData,
          this.requestMetadata.payloadStreamingId,
        );
      } else {
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

  private legacyOverrideEmit = (responseData, streamOverWebsocket = false) => {
    if (responseData) {
      responseData['headers'] = responseData['headers'] ?? {};
      responseData.headers['snyk-request-id'] = this.requestMetadata.requestId;
      responseData.headers['x-broker-ws-response'] =
        responseData.headers['x-broker-ws-response'] ?? 'true';
    }

    // Traffic over websockets
    if (this.requestMetadata.payloadStreamingId) {
      if (streamOverWebsocket) {
        legacyStreaming(
          this.logContext,
          responseData,
          this.options,
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
      logger.debug(
        { ...this.logContext, responseData },
        '[Websocket Flow] (Legacy) Sending fixed response over WebSocket connection',
      );
      this.websocketResponseHandler(responseData);
    }
  };
}
