import { Request, Response } from 'express';
import {
  BrokerAuthError,
  validateBrokerClientCredentials,
} from '../auth/authHelpers';
import { log as logger } from '../../../logs/logger';
import { type ClientSocket, getSocketConnectionByIdentifier } from '../socket';
import { maskToken } from '../../common/utils/token';

interface BrokerConnectionAuthRequest {
  data: {
    attributes: {
      broker_client_id: string;
    };
    id: string;
    type: 'broker_connection';
  };
}

export const authRefreshHandler = async (req: Request, res: Response) => {
  let currentClient: ClientSocket | null | undefined;
  try {
    const role = req.query['connection_role'];
    const brokerAppClientId =
      req.headers[`${process.env.SNYK_INTERNAL_AUTH_CLIENT_ID_HEADER}`] ??
      'not available';
    const identifier = req.params.identifier;
    logger.debug(
      { maskedToken: maskToken(identifier), brokerAppClientId, role },
      `Auth Refresh`,
    );

    const body = JSON.parse(req.body.toString()) as BrokerConnectionAuthRequest;
    const brokerClientId = body.data.attributes.broker_client_id;

    const connection = getSocketConnectionByIdentifier(identifier);
    currentClient = connection
      ? connection.find(
          (x) => x.metadata.clientId === brokerClientId && x.role === role,
        )
      : null;

    if (brokerAppClientId === undefined || !connection || !currentClient) {
      logger.debug(
        { identifier, brokerClientId, role },
        'Missing required authorization header.',
      );
      throw new BrokerAuthError('Missing required authorization header.');
    }

    // deepcode ignore Ssrf: request URL comes from the filter response, with the origin url being injected by the filtered version
    await validateBrokerClientCredentials(
      req.headers,
      identifier,
      true,
      brokerClientId,
    );
    // Refresh client validation time
    const nowDate = new Date().toISOString();
    currentClient.credsValidationTime = nowDate;
    const currentClientIndex = connection.findIndex(
      (x) => x.brokerClientId === brokerClientId && x.role === role,
    );
    if (currentClientIndex === -1) {
      throw new Error('Unable to find client connection.');
    }
    connection[currentClientIndex] = currentClient;
    return res.status(201).send('OK');
  } catch (err) {
    currentClient?.socket?.end();
    if (err instanceof BrokerAuthError) {
      return res.status(401).send(err.message);
    }
    return res.status(500).send(`Unable to complete auth refresh: ${err}.`);
  }
};
