import { Request, Response } from 'express';
import { validateBrokerClientCredentials } from '../auth/authHelpers';
import { log as logger } from '../../logs/logger';
import { getSocketConnectionByIdentifier } from '../socket';
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
  const credentialsFromHeader =
    req.headers['Authorization'] ?? req.headers['authorization'];
  const role = req.query['connection_role'];
  const credentials = `${credentialsFromHeader}`;
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
  const currentClient = connection
    ? connection.find(
        (x) => x.metadata.clientId === brokerClientId && x.role === role,
      )
    : null;
  logger.debug({ identifier, brokerClientId, role }, 'Validating credentials');
  if (
    credentials === undefined ||
    brokerAppClientId === undefined ||
    !connection ||
    !currentClient
  ) {
    logger.debug(
      { identifier, brokerClientId, role, credentials },
      'Invalid credentials',
    );
    return res.status(401).send('Invalid credentials.');
  } else {
    const credsCheckResponse = await validateBrokerClientCredentials(
      credentials,
      brokerClientId as string,
      identifier,
      true,
    );
    logger.debug(
      { credsCheckResponse: credsCheckResponse },
      'Client Creds validation response.',
    );
    if (credsCheckResponse) {
      // Refresh client validation time
      const nowDate = new Date().toISOString();
      currentClient.credsValidationTime = nowDate;
      const currentClientIndex = connection.findIndex(
        (x) => x.brokerClientId === brokerClientId && x.role === role,
      );
      if (currentClientIndex > -1) {
        connection[currentClientIndex] = currentClient;
        return res.status(201).send('OK');
      } else {
        return res.status(500).send('Unable to find client connection.');
      }
    } else {
      logger.debug(
        { identifier, brokerClientId, role, credentials },
        'Invalid credentials - Creds check response returned false',
      );
      currentClient.socket!.end();
      return res.status(401).send('Credentials failed validation');
    }
  }
};
