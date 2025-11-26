import { Request, Response } from 'express';
import { HybridClientRequestHandler } from '../../clientRequestHelpers';
import semver from 'semver';

export interface preparedRequest {
  url: string;
  headers: Object;
  method: string;
  body?: unknown;
  timeoutMs?: number;
}
const minimalServiceEnabledBrokerVersion =
  process.env.MINIMAL_SERVICE_ENABLED_BROKER_VERSION ?? '4.209.0';

export const serviceHandler = async (req: Request, res: Response) => {
  const clientVersion = res.locals.clientVersion;
  if (
    clientVersion != 'local' &&
    semver.lt(clientVersion, minimalServiceEnabledBrokerVersion)
  ) {
    res.status(501).json({
      ok: false,
      msg: `Not implemented for client versions before ${minimalServiceEnabledBrokerVersion}`,
    });
  } else {
    const headers = req.headers;
    headers['x-broker-ws-response'] = 'true';
    const hybridClientRequestHandler = new HybridClientRequestHandler(req, res);
    const request: preparedRequest = {
      url: req.url,
      headers,
      method: req.method,
    };
    hybridClientRequestHandler.makeRequest(request, false);
  }
};
