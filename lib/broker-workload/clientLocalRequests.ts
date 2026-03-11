import { Request, Response } from 'express';
import { HybridClientRequestHandler } from '../hybrid-sdk/clientRequestHelpers';

import { filterClientRequest } from './requestFiltering';
import { log as logger } from '../logs/logger';
import { getInterpolatedRequest } from '../hybrid-sdk/interpolateRequestWithConfigData';
import { randomUUID } from 'node:crypto';
import {
  LocalClientWorkloadRuntimeParams,
  Workload,
  WorkloadType,
} from '../hybrid-sdk/workloadFactory';
import { ExtendedLogContext } from '../hybrid-sdk/common/types/log';
import { incrementHttpRequestsTotal } from '../hybrid-sdk/common/utils/metrics';
import { maskToken, hashToken } from '../hybrid-sdk/common/utils/token';

/**
 * Handler for a single incoming HTTP request from a local client (e.g. Snyk CLI) or webhook.
 * Checks the request against accept rules; if it matches, forwards it (over HTTP or the existing
 * connection); otherwise responds with 401 blocked.
 */
export class BrokerClientRequestWorkload extends Workload<WorkloadType.localClient> {
  req: Request;
  res: Response;
  options;
  constructor(req, res, options) {
    super('broker', WorkloadType['local-client']);
    this.req = req;
    this.res = res;
    this.options = options;
  }

  async handler(data: LocalClientWorkloadRuntimeParams) {
    const hybridClientRequestHandler = new HybridClientRequestHandler(
      this.req,
      this.res,
    );
    const matchedFilterRule = filterClientRequest(
      this.req,
      this.options,
      this.res.locals.websocket,
    );

    const logContext: ExtendedLogContext = {
      url: this.req.url,
      connectionName: '',
      requestMethod: this.req.method,
      requestHeaders: this.req.headers,
      streamingID: '',
      maskedToken: this.res.locals.websocket.connectionIdentifier
        ? maskToken(this.res.locals.websocket.connectionIdentifier)
        : '',
      hashedToken: this.res.locals.websocket.connectionIdentifier
        ? hashToken(this.res.locals.websocket.connectionIdentifier)
        : '',
      transport:
        this.res.locals.websocket?.socket?.transport?.name ?? 'unknown',
      responseMedium: this.req.headers['x-broker-ws-response']
        ? 'websocket'
        : 'http',
      requestId: `${this.req.headers['snyk-request-id'] ?? randomUUID()}`,
    };

    if (!matchedFilterRule) {
      incrementHttpRequestsTotal(true, 'inbound-request');
      const reason =
        'Request does not match any accept rule, blocking HTTP request';
      hybridClientRequestHandler.logContext.error = 'blocked';
      logger.warn(hybridClientRequestHandler.logContext, reason);
      // TODO: respect request headers, block according to content-type
      return this.res
        .status(401)
        .send({ message: 'blocked', reason, url: this.req.url });
    } else {
      // Extract connection identifier from the selected websocket connection
      const connectionIdentifier =
        this.res.locals.websocket?.identifier || null;
      hybridClientRequestHandler.makeRequest(
        getInterpolatedRequest(
          connectionIdentifier,
          matchedFilterRule,
          this.req,
          logContext,
          this.options.config,
          'upstream',
        ),
        data.makeRequestOverHttp,
      );
      incrementHttpRequestsTotal(false, 'inbound-request');
    }
  }
}
