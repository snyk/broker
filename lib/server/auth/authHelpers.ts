import { getConfig } from '../../common/config/config';
import { PostFilterPreparedRequest } from '../../common/relay/prepareRequest';
import { maskToken } from '../../common/utils/token';
import { makeSingleRawRequestToDownstream } from '../../hybrid-sdk/http/request';
import { log as logger } from '../../logs/logger';

export const validateBrokerClientCredentials = async (
  authHeaderValue: string,
  brokerClientId: string,
  brokerConnectionIdentifier: string,
) => {
  const body = {
    data: {
      type: 'broker_connection',
      attributes: {
        broker_client_id: brokerClientId,
      },
    },
  };

  const req: PostFilterPreparedRequest = {
    url: `${
      getConfig().apiHostname
    }/hidden/brokers/connections/${brokerConnectionIdentifier}/auth/validate?version=2024-02-08~experimental`,
    headers: {
      authorization: authHeaderValue,
      'Content-type': 'application/vnd.api+json',
    },
    method: 'POST',
    body: JSON.stringify(body),
  };
  logger.debug(
    { maskToken: maskToken(brokerConnectionIdentifier) },
    `Validate Broker Client Credentials request`,
  );
  const response = await makeSingleRawRequestToDownstream(req);
  logger.debug(
    { validationResponseCode: response.statusCode },
    'Validate Broker Client Credentials response',
  );
  if (response.statusCode === 201) {
    return true;
  } else {
    logger.debug(
      { statusCode: response.statusCode, message: response.statusText },
      `Broker ${brokerConnectionIdentifier} client ID ${brokerClientId} failed validation.`,
    );
    return false;
  }
};
