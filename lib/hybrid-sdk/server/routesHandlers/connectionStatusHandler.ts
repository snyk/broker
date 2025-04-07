import { Request, Response } from 'express';
import { getDesensitizedToken } from '../utils/token';
import { getSocketConnections } from '../socket';
import { log as logger } from '../../../logs/logger';
import { hostname } from 'node:os';
import { PostFilterPreparedRequest } from '../../../broker-workload/prepareRequest';
import { makeStreamingRequestToDownstream } from '../../http/request';
import { hashToken } from '../../common/utils/token';

export interface ClientSummary {
  brokerClientIds: string[];
  versions: string[];
  identifier: string;
  hashedIdentifier: string;
}

export const connectionStatusHandler = async (req: Request, res: Response) => {
  const token = req.params.token;
  const desensitizedToken = getDesensitizedToken(token);
  const connections = getSocketConnections();
  if (connections.has(token)) {
    const clientsMetadata = connections.get(req.params.token)!.map((conn) => ({
      version: conn.metadata && conn.metadata.version,
      filters: conn.metadata && conn.metadata.filters,
    }));
    return res.status(200).json({ ok: true, clients: clientsMetadata });
  } else {
    const localHostname = hostname();
    const regex = new RegExp(/-[0-9]{1,2}-[0-1]/);
    if (
      !process.env.BROKER_SERVER_MANDATORY_AUTH_ENABLED &&
      localHostname &&
      localHostname.endsWith('-1') &&
      localHostname.match(regex)
    ) {
      const url = new URL(`http://${req.hostname}${req.url}`);
      url.hostname = req.hostname.replace(/-[0-9]{1,2}\./, '.');
      url.searchParams.append('connection_role', 'primary');

      const postFilterPreparedRequest: PostFilterPreparedRequest = {
        url: url.toString(),
        headers: req.headers,
        method: req.method,
      };
      if (
        req.method == 'POST' ||
        req.method == 'PUT' ||
        req.method == 'PATCH'
      ) {
        postFilterPreparedRequest.body = req.body;
      }
      logger.debug(
        { url: req.url, method: req.method },
        'Making request to primary',
      );
      try {
        // deepcode ignore Ssrf: request URL comes from the filter response, with the origin url being injected by the filtered version
        const httpResponse = await makeStreamingRequestToDownstream(
          postFilterPreparedRequest,
        );
        res.writeHead(httpResponse.statusCode ?? 500, httpResponse.headers);
        return httpResponse.pipe(res);
      } catch (err) {
        logger.error({ err }, `Error in HTTP middleware: ${err}`);
        res.setHeader('x-broker-failure', 'error-forwarding-to-primary');
        res.status(500).send('Error forwarding request to primary.');
      }
    } else {
      logger.warn({ desensitizedToken }, 'No matching connection found.');
      res.setHeader('x-broker-failure', 'no-connection');
      return res.status(404).json({ ok: false });
    }
  }
};

export const connectionsStatusHandler = async (req: Request, res: Response) => {
  const connectionSummary: ClientSummary[] = [];
  const connections = getSocketConnections();
  for (const [key, value] of connections) {
    connectionSummary.push({
      identifier: key,
      hashedIdentifier: hashToken(key),
      versions: [...new Set(value.map((x) => x.metadata.version))],
      brokerClientIds: [...new Set(value.map((x) => x.brokerClientId))],
    });
  }
  res.status(200).json(connectionSummary);
};
