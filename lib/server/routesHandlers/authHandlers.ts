import { Request, Response } from 'express';
import { validateBrokerClientCredentials } from '../auth/authHelpers';
import { log as logger } from '../../logs/logger';
import { validate } from 'uuid';
import { getSocketConnectionByIdentifier } from '../socket';
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
  const credentials = req.headers['authorization'];
  const brokerAppClientId =
    req.headers[`${process.env.SNYK_INTERNAL_AUTH_CLIENT_ID_HEADER}`];
  const identifier = req.params.identifier;
  const body = JSON.parse(req.body.toString()) as BrokerConnectionAuthRequest;
  const brokerClientId = body.data.attributes.broker_client_id;
  if (
    !validate(identifier) ||
    !validate(brokerClientId) ||
    !validate(brokerAppClientId)
  ) {
    logger.warn(
      { identifier, brokerClientId, brokerAppClientId },
      'Invalid credentials',
    );
    return res.status(401).send('Invalid parameters or credentials.');
  }
  const connection = getSocketConnectionByIdentifier(identifier);
  const currentClient = connection
    ? connection.find((x) => x.metadata.clientId === brokerClientId)
    : null;
  logger.debug({ identifier, brokerClientId }, 'Validating credentials');
  if (
    credentials === undefined ||
    brokerAppClientId === undefined ||
    credentials?.split('.').length != 3 ||
    !connection ||
    !currentClient
  ) {
    return res.status(401).send('Invalid credentials.');
  } else {
    const credsCheckResponse = await validateBrokerClientCredentials(
      credentials,
      brokerAppClientId as string,
      identifier,
    );
    if (credsCheckResponse) {
      return res.status(200).send('OK');
    } else {
      currentClient.socket!.end();
      return res.status(401).send('Invalid credentials.');
    }
  }
};
