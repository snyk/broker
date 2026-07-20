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
import { emitError } from '../hybrid-sdk/client/events';
import { ExtendedLogContext } from '../hybrid-sdk/common/types/log';
import {
  BROKER_ERROR_CODES,
  classifyDownstreamError,
  statusForErrorCode,
} from '../hybrid-sdk/common/types/telemetry';
import {
  incrementWebSocketRequestsTotal,
  incrementHttpRequestsTotal,
} from '../hybrid-sdk/common/utils/metrics';
import type { Client as MetricsClient } from '../hybrid-sdk/client/metrics/client';
import { maskToken, hashToken } from '../hybrid-sdk/common/utils/token';
import { WebSocketServer } from '../hybrid-sdk/server/types/socket';
import { WebSocketConnection } from '../hybrid-sdk/client/types/client';

// Converts status code to string like 5xx
function statusClass(statusCode: number | undefined): string {
  return statusCode != null ? `${String(statusCode)[0]}xx` : 'unknown';
}

export type BrokerWorkloadOptions = {
  config: {
    brokerType: 'client' | 'server';
    universalBrokerEnabled: boolean;
  };
  metricsClient?: MetricsClient;
};

/**
 * Handler for a single request received over the WebSocket connection. Checks the request against
 * accept rules; if it matches, performs the downstream HTTP request and sends the response back
 * over the WebSocket; otherwise blocks and responds with an error.
 */
export class BrokerWorkload extends Workload<WorkloadType.remoteServer> {
  options: BrokerWorkloadOptions;
  connectionIdentifier: string;
  websocketConnectionHandler: WebSocketServer | WebSocketConnection;
  constructor(
    connectionIdentifier: string,
    options: BrokerWorkloadOptions,
    websocketConnectionHandler: WebSocketServer | WebSocketConnection,
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
    const contextId = payload.headers['x-snyk-broker-context-id'] as
      | string
      | undefined;

    const logContext: ExtendedLogContext = {
      url: payload.url,
      connectionName: this.websocketConnectionHandler.friendlyName ?? '',
      contextId,
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
      requestId: payload.requestId,
    };

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

    const metricsClient = this.options.metricsClient;

    const matchedFilterRule = filterRequest(
      payload,
      this.options,
      this.websocketConnectionHandler,
    );
    if (!matchedFilterRule) {
      incrementWebSocketRequestsTotal(true, 'inbound-request');
      metricsClient?.recordRequest('broker-server', false);
      const reason =
        '[Websocket Flow][Blocked Request] Does not match any accept rule';
      logContext.error = 'Blocked by filter rules';
      logger.warn(logContext, reason);
      return responseHandler.sendResponse({
        status: statusForErrorCode(BROKER_ERROR_CODES.FILTER_BLOCKED),
        errorType: BROKER_ERROR_CODES.FILTER_BLOCKED,
        body: {
          code: BROKER_ERROR_CODES.FILTER_BLOCKED,
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
      metricsClient?.recordRequest('broker-server', true);
      const streaming = Boolean(payload.streamingID);
      metricsClient?.recordDownstreamRequest(streaming);
      const contextId = payload.headers['x-snyk-broker-context-id'] ?? null;
      // mutates the payload
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

      try {
        metricsClient?.incrementInflight();
        if (streaming) {
          // indicates server supports streaming
          try {
            const start = performance.now();
            const downstreamRequestIncomingResponse =
              await makeStreamingRequestToDownstream(preparedRequest.req);
            metricsClient?.recordDownstreamDuration(
              true,
              (performance.now() - start) / 1000, // convert ms to seconds
            );
            const contentLength =
              downstreamRequestIncomingResponse.headers['content-length'];
            if (contentLength) {
              const bytes = parseInt(contentLength, 10);
              if (!isNaN(bytes)) {
                metricsClient?.recordUpstreamResponseBytes(bytes);
              }
            }
            responseHandler.streamDataResponse(
              downstreamRequestIncomingResponse,
            );
          } catch (e) {
            logger.error(
              {
                ...logContext,
                error: e,
                stackTrace: new Error('stacktrace generator').stack,
              },
              '[Downstream] Caught error making streaming request to downstream ',
            );
            const code = classifyDownstreamError(e);
            // Bounded classification only — never the downstream message/body.
            emitError({
              errorCode: code,
              requestId: logContext.requestId,
              integrationType: logContext.connectionName,
            });
            return responseHandler.sendResponse({
              status: statusForErrorCode(code),
              errorType: code,
              body: { code, message: (e as Error)?.message },
            });
          }
        } else {
          // here if request against server had header x-broker-ws-response:true
          const start = performance.now();
          try {
            const response = await makeRequestToDownstream(preparedRequest.req);
            metricsClient?.recordDownstreamDuration(
              false,
              (performance.now() - start) / 1000,
            );
            metricsClient?.recordDownstreamStatus(
              statusClass(response?.statusCode),
            );
            const status = (response && response.statusCode) || 500;
            // Threshold matches downstream-post-stream-to-server.ts: surface
            // 401/403 and all 5xx (customer-actionable auth/scope/upstream
            // issues) but skip 404, which is often a probe on the happy path.
            // Prior `status > 404` accidentally also silenced 401/402/403.
            if (status >= 400 && status !== 404) {
              logger.warn(
                {
                  statusCode: response.statusCode,
                  url: preparedRequest.req.url,
                  requestId: logContext.requestId,
                },
                `[Websocket Flow][Inbound] Non-2xx response from downstream SCM.`,
              );
            }
            responseHandler.sendDataResponse(response, logContext);
          } catch (error) {
            metricsClient?.recordDownstreamDuration(
              false,
              (performance.now() - start) / 1000,
            );
            metricsClient?.recordDownstreamStatus('5xx');
            logError(logContext, error);
            const code = classifyDownstreamError(error);
            // emitError is intentionally absent here: the caller receives a
            // structured HTTP error response, making the failure observable
            // via the response path. Only the streaming catch emits, because
            // streaming failures are otherwise silent to the server.
            return responseHandler.sendResponse({
              status: statusForErrorCode(code),
              errorType: code,
              body: { code, message: (error as Error)?.message },
            });
          }
        }
      } finally {
        metricsClient?.decrementInflight();
      }
    }
  }
}
