import { Request, Response } from 'express';
import { HybridClientRequestHandler } from '../hybrid-sdk/clientRequestHelpers';
import { incrementHttpRequestsTotal } from '../common/utils/metrics';
import { filterClientRequest } from './requestFiltering';
import { log as logger } from '../logs/logger';
import {
  LocalClientWorkloadRuntimeParams,
  Workload,
  WorkloadType,
} from '../hybrid-sdk/workloadFactory';

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
    const filterResponse = filterClientRequest(
      this.req,
      this.options,
      this.res.locals.websocket,
    );

    if (!filterResponse) {
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
      hybridClientRequestHandler.makeRequest(
        filterResponse,
        data.makeRequestOverHttp,
      );
      incrementHttpRequestsTotal(false, 'inbound-request');
    }
  }
}
