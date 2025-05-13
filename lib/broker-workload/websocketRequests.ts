import { runPreRequestPlugins } from '../hybrid-sdk/client/brokerClientPlugins/pluginManager';
import { computeContentLength } from './content-length';
import { contentLengthHeader } from './headers-value-constants';

import { log as logger } from '../logs/logger';
import { HybridResponseHandler } from '../hybrid-sdk/responseSenders';
import { getCorrelationDataFromHeaders } from './correlation-headers';
import { filterRequest } from './requestFiltering';
import {
  makeRequestToDownstream,
  makeStreamingRequestToDownstream,
} from '../hybrid-sdk/http/request';
import { logError } from '../logs/log';
import { getInterpolatedRequest } from '../hybrid-sdk/interpolateRequestWithConfigData';
import {
  RemoteServerWorkloadRuntimeParams,
  Workload,
  WorkloadType,
} from '../hybrid-sdk/workloadFactory';
import { prepareRequest } from './prepareRequest';
import { ExtendedLogContext } from '../hybrid-sdk/common/types/log';
import {
  incrementWebSocketRequestsTotal,
  incrementHttpRequestsTotal,
} from '../hybrid-sdk/common/utils/metrics';
import { maskToken, hashToken } from '../hybrid-sdk/common/utils/token';

export class BrokerWorkload extends Workload<WorkloadType.remoteServer> {
  options;
  connectionIdentifier: string;
  websocketConnectionHandler;
  constructor(
    connectionIdentifier: string,
    options,
    websocketConnectionHandler,
  ) {
    super('broker', WorkloadType['remote-server']);
    this.options = options;
    this.connectionIdentifier = connectionIdentifier;
    this.websocketConnectionHandler = websocketConnectionHandler;
  }

  async handler(data: RemoteServerWorkloadRuntimeParams) {
    const { payload, websocketHandler } = data;

    // Safety cleanup
    const contextIdRegex =
      /^\/ctx\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/;
    const contextMatch = payload.url.match(contextIdRegex);
    if (contextMatch) {
      payload.url = payload.url.replace(contextIdRegex, '');
    }
    // End of safety cleanup

    const websocketResponseHandler = websocketHandler;
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
      },
      this.websocketConnectionHandler,
      websocketResponseHandler,
      this.options.config,
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

    const matchedFilterRule = filterRequest(
      payload,
      this.options,
      this.websocketConnectionHandler,
    );
    if (!matchedFilterRule) {
      incrementWebSocketRequestsTotal(true, 'inbound-request');
      const reason =
        '[Websocket Flow][Blocked Request] Does not match any accept rule';
      logContext.error = 'Blocked by filter rules';
      logger.warn(logContext, reason);
      // TODO: need to type the response object
      return responseHandler.sendResponse({
        status: 401,
        body: {
          message: 'blocked',
          reason,
          url: payload.url,
        },
      });
    } else {
      const urlInterpolated = getInterpolatedRequest(
        this.connectionIdentifier,
        matchedFilterRule,
        payload,
        logContext,
        this.options.config,
        'downstream',
      );

      incrementWebSocketRequestsTotal(false, 'inbound-request');
      const contextId = payload.headers['x-snyk-broker-context-id'] ?? null;
      const preparedRequest = await prepareRequest(
        urlInterpolated,
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
          contextId,
        );
        payload.headers[contentLengthHeader] = computeContentLength(payload);
      }
      if (this.options.config.brokerType !== 'client') {
        preparedRequest.req.headers['x-snyk-broker'] = `${maskToken(
          this.connectionIdentifier,
        )}`;
      }
      incrementHttpRequestsTotal(false, 'outbound-request');

      if (payload.streamingID) {
        // indicates server supports streaming
        try {
          const downstreamRequestIncomingResponse =
            await makeStreamingRequestToDownstream(preparedRequest.req);
          responseHandler.streamDataResponse(downstreamRequestIncomingResponse);
        } catch (e) {
          logger.error(
            {
              ...logContext,
              error: e,
              stackTrace: new Error('stacktrace generator').stack,
            },
            '[Downstream] Caught error making streaming request to downstream ',
          );
        }
      } else {
        // here if request against server had header x-broker-ws-response:true
        try {
          const response = await makeRequestToDownstream(preparedRequest.req);
          const status = (response && response.statusCode) || 500;
          if (status > 404) {
            logger.warn(
              {
                statusCode: response.statusCode,
                responseHeaders: response.headers,
                url: preparedRequest.req.url,
              },
              `[Websocket Flow][Inbound] Unexpected status code for relayed request.`,
            );
          }
          responseHandler.sendDataResponse(response, logContext);
        } catch (error) {
          logError(logContext, error);
          return responseHandler.sendResponse({
            status: 500,
            body: error,
          });
        }
      }
    }
  }
}
