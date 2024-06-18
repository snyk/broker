import { RequestPayload } from '../types/http';
import { ExtendedLogContext } from '../types/log';
import { hashToken, maskToken } from '../utils/token';
import { log as logger } from '../../logs/logger';
import { BrokerServerPostResponseHandler } from '../http/downstream-post-stream-to-server';
import {
  incrementHttpRequestsTotal,
  incrementWebSocketRequestsTotal,
} from '../utils/metrics';
import { WebSocketConnection } from '../../client/types/client';
import { prepareRequestFromFilterResult } from './prepareRequest';
import {
  makeLegacyRequest,
  makePostStreamingRequest,
  legacyStreaming,
} from './requestsHelper';
import { LOADEDFILTERSET } from '../types/filter';
import { LoadedClientOpts, LoadedServerOpts } from '../types/options';
import { runPreRequestPlugins } from '../../client/brokerClientPlugins/pluginManager';
import { computeContentLength } from '../utils/content-length';
import { contentLengthHeader } from '../utils/headers-value-constants';
import { translateIntegrationTypeToBrokerIntegrationType } from '../../client/utils/integrations';

export const forwardWebSocketRequest = (
  options: LoadedClientOpts | LoadedServerOpts,
  websocketConnectionHandler: WebSocketConnection,
) => {
  // 1. Request coming in over websocket conn (logged)
  // 2. Filter for rule match (log and block if no match)
  // 3. Relay over HTTP conn (logged)
  // 4. Get response over HTTP conn (logged)
  // 5. Send response over websocket conn

  return (connectionIdentifier) => async (payload: RequestPayload, emit) => {
    if (options.config.universalBrokerEnabled) {
      payload.connectionIdentifier = connectionIdentifier;
    }
    const requestId = payload.headers['snyk-request-id'];
    const logContext: ExtendedLogContext = {
      url: payload.url,
      connectionName: websocketConnectionHandler.friendlyName ?? '',
      requestMethod: payload.method,
      requestHeaders: payload.headers,
      requestId,
      streamingID: payload.streamingID,
      maskedToken: maskToken(connectionIdentifier),
      hashedToken: hashToken(connectionIdentifier),
      transport:
        websocketConnectionHandler?.socket?.transport?.name ?? 'unknown',
      responseMedium: payload.headers['x-broker-ws-response']
        ? 'websocket'
        : 'http',
    };

    if (!requestId) {
      // This should be a warning but older clients won't send one
      // TODO make this a warning when significant majority of clients are on latest version
      logger.debug(
        logContext,
        'Header Snyk-Request-Id not included in headers passed through',
      );
    }

    // It clarifies which emit handler is for websockets vs POST response
    const websocketEmit = emit;

    const postOverrideEmit = (
      responseData,
      isResponseFromRequestModule = false,
    ) => {
      try {
        logContext.requestMethod = '';
        logContext.requestHeaders = {};

        const postHandler = new BrokerServerPostResponseHandler(
          logContext,
          options.config,
          connectionIdentifier,
          options.config.universalBrokerEnabled
            ? websocketConnectionHandler?.serverId
            : options.config.serverId,
          requestId,
          websocketConnectionHandler.role,
        );
        if (isResponseFromRequestModule) {
          logger.debug(
            logContext,
            '[Websocket Flow] Posting HTTP streaming response back to Broker Server',
          );
          postHandler.forwardRequest(responseData, payload.streamingID);
        } else {
          logger.debug(
            logContext,
            '[Websocket Flow] Posting HTTP response back to Broker Server',
          );
          // Only for responses generated internally in the Broker Client/Server
          postHandler.sendData(responseData, payload.streamingID);
        }
      } catch (err) {
        logger.error({ err }, `Error Posting via Emit callback.`);
      }
    };

    const legacyOverrideEmit = (
      responseData,
      isResponseFromRequestModule = false,
    ) => {
      if (responseData) {
        responseData['headers'] = responseData['headers'] ?? {};
        responseData.headers['snyk-request-id'] = requestId;
        responseData.headers['x-broker-ws-response'] =
          responseData.headers['x-broker-ws-response'] ?? 'true';
      }

      // Traffic over websockets
      if (payload.streamingID) {
        if (isResponseFromRequestModule) {
          legacyStreaming(
            logContext,
            responseData,
            options.config,
            websocketConnectionHandler,
            payload.streamingID,
          );
        } else {
          websocketConnectionHandler?.send(
            'chunk',
            payload.streamingID,
            '',
            false,
            {
              status: responseData.status,
              headers: responseData.headers,
            },
          );
          websocketConnectionHandler?.send(
            'chunk',
            payload.streamingID,
            JSON.stringify(responseData.body),
            true,
          );
        }
      } else {
        logger.debug(
          { ...logContext, responseData },
          '[Websocket Flow] (Legacy) Sending fixed response over WebSocket connection',
        );
        websocketEmit(responseData);
      }
    };

    if (
      websocketConnectionHandler?.capabilities?.includes(
        'receive-post-streams',
      ) &&
      !emit
    ) {
      // Traffic over HTTP Post
      emit = postOverrideEmit;
    } else {
      emit = legacyOverrideEmit;
    }

    const simplifiedContext = logContext;
    delete simplifiedContext.requestHeaders;
    logger.info(
      simplifiedContext,
      `[Websocket Flow] Received request from ${
        process.env.BROKER_TYPE == 'client' ? 'client' : 'server'
      }`,
    );

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
              websocketConnectionHandler.supportedIntegrationType,
              options.config,
            ),
          )
          ?.private(payload) || false;
    } else {
      const loadedFilters = options.loadedFilters as LOADEDFILTERSET;
      filterResponse = loadedFilters.private(payload);
    }
    if (!filterResponse) {
      incrementWebSocketRequestsTotal(true, 'inbound-request');
      const reason =
        '[Websocket Flow][Blocked Request] Does not match any accept rule';
      logContext.error = 'Blocked by filter rules';
      logger.warn(logContext, reason);
      return emit({
        status: 401,
        body: {
          message: 'blocked',
          reason,
          url: payload.url,
        },
      });
    } else {
      incrementWebSocketRequestsTotal(false, 'inbound-request');
      const preparedRequest = await prepareRequestFromFilterResult(
        filterResponse,
        payload,
        logContext,
        options,
        connectionIdentifier,
        websocketConnectionHandler?.socketType,
      );
      if (options.config.universalBrokerEnabled) {
        preparedRequest.req = await runPreRequestPlugins(
          options,
          connectionIdentifier,
          preparedRequest.req,
        );
        payload.headers[contentLengthHeader] = computeContentLength(payload);
      }

      incrementHttpRequestsTotal(false, 'outbound-request');
      payload.streamingID
        ? await makePostStreamingRequest(preparedRequest.req, emit, logContext)
        : await makeLegacyRequest(
            preparedRequest.req,
            emit,
            logContext,
            options,
          );
    }
  };
};
