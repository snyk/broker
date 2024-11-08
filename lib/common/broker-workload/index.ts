import { runPreRequestPlugins } from '../../client/brokerClientPlugins/pluginManager';
import { getFilterConfig } from '../../client/config/filters';
import { prepareRequestFromFilterResult } from '../relay/prepareRequest';
import { LOADEDFILTERSET } from '../types/filter';
import { ExtendedLogContext } from '../types/log';
import { computeContentLength } from '../utils/content-length';
import { contentLengthHeader } from '../utils/headers-value-constants';
import {
  incrementWebSocketRequestsTotal,
  incrementHttpRequestsTotal,
} from '../utils/metrics';
import { maskToken, hashToken } from '../utils/token';
import { log as logger } from '../../logs/logger';
import { HybridResponseHandler } from '../relay/responseSenders';
import { getCorrelationDataFromHeaders } from '../utils/correlation-headers';

export class brokerWorkload {
  options;
  connectionIdentifier: string;
  websocketConnectionHandler;
  constructor(
    connectionIdentifier: string,
    options,
    websocketConnectionHandler,
  ) {
    this.options = options;
    this.connectionIdentifier = connectionIdentifier;
    this.websocketConnectionHandler = websocketConnectionHandler;
  }

  async handler(payload, websocketResponseHandler) {
    if (this.options.config.universalBrokerEnabled) {
      payload.connectionIdentifier = this.connectionIdentifier;
    }
    const correlationHeaders = getCorrelationDataFromHeaders(payload.headers);

    const logContext: ExtendedLogContext = {
      url: payload.url,
      connectionName: this.websocketConnectionHandler.friendlyName ?? '',
      requestMethod: payload.method,
      requestHeaders: payload.headers,
      streamingID: payload.streamingID,
      maskedToken: maskToken(this.connectionIdentifier),
      hashedToken: hashToken(this.connectionIdentifier),
      transport:
        this.websocketConnectionHandler?.socket?.transport?.name ?? 'unknown',
      responseMedium: payload.headers['x-broker-ws-response']
        ? 'websocket'
        : 'http',
      ...correlationHeaders,
    };

    if (!correlationHeaders.requestId) {
      // This should be a warning but older clients won't send one
      // TODO make this a warning when significant majority of clients are on latest version
      logger.debug(
        logContext,
        'Header Snyk-Request-Id not included in headers passed through',
      );
    }
    const responseHandler = new HybridResponseHandler(
      {
        connectionIdentifier: this.connectionIdentifier,
        payloadStreamingId: payload.streamingID,
        ...correlationHeaders,
        overHttp: payload.headers['x-broker-ws-response'] ? false : true,
      },
      this.websocketConnectionHandler,
      websocketResponseHandler,
      logContext,
    );

    const simplifiedContext = structuredClone(logContext);
    delete simplifiedContext.requestHeaders;
    logger.info(
      simplifiedContext,
      `[Websocket Flow] Received request from ${
        process.env.BROKER_TYPE == 'client' ? 'client' : 'server'
      }`,
    );

    let filterResponse;
    if (
      this.options.config.brokerType == 'client' &&
      this.options.config.universalBrokerEnabled
    ) {
      const loadedFilters = getFilterConfig().loadedFilters as Map<
        string,
        LOADEDFILTERSET
      >;
      filterResponse =
        loadedFilters
          .get(this.websocketConnectionHandler.supportedIntegrationType)
          ?.private(payload) || false;
    } else if (this.options.config.brokerType == 'client') {
      const loadedFilters = getFilterConfig().loadedFilters as LOADEDFILTERSET;
      filterResponse = loadedFilters.private(payload);
    } else {
      const loadedFilters = this.options.loadedFilters as LOADEDFILTERSET;
      filterResponse = loadedFilters.private(payload);
    }
    if (!filterResponse) {
      incrementWebSocketRequestsTotal(true, 'inbound-request');
      const reason =
        '[Websocket Flow][Blocked Request] Does not match any accept rule';
      logContext.error = 'Blocked by filter rules';
      logger.warn(logContext, reason);
      return responseHandler.sendResponse({
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
        this.options,
        this.connectionIdentifier,
        this.websocketConnectionHandler?.socketType,
      );
      if (this.options.config.universalBrokerEnabled) {
        preparedRequest.req = await runPreRequestPlugins(
          this.options,
          this.connectionIdentifier,
          preparedRequest.req,
        );
        payload.headers[contentLengthHeader] = computeContentLength(payload);
      }
      incrementHttpRequestsTotal(false, 'outbound-request');
      await responseHandler.sendDataResponse(
        payload.streamingID,
        preparedRequest.req,
        logContext,
      );
    }
  }
}
