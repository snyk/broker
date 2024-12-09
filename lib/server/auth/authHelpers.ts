import { PostFilterPreparedRequest } from '../../common/relay/prepareRequest';
import { makeSingleRawRequestToDownstream } from '../../hybrid-sdk/http/request';
import { log as logger } from '../../logs/logger';

export const validateBrokerClientCredentials = async (
  authHeaderValue: string,
  brokerAppClientId: string,
  brokerConnectionIdentifier: string,
) => {
  if (
    !process.env.HPS_BACKEND_URL_WITH_BASE_PATH ||
    !process.env.HPS_BACKEND_VERSION
  ) {
    logger.error({}, `HPS Backend not configured correctly.`);
    throw new Error(`HPS Backend not configured correctly.`);
  }
  const body = {
    data: {
      type: 'broker_connection',
      attributes: {
        broker_app_client_id: brokerAppClientId,
      },
    },
  };
  const req: PostFilterPreparedRequest = {
    url: `${process.env.HPS_BACKEND_URL_WITH_BASE_PATH}/${brokerConnectionIdentifier}/auth/validate?version=${process.env.HPS_BACKEND_VERSION}`,
    headers: {
      authorization: authHeaderValue,
      'Content-type': 'application/vnd.api+json',
    },
    method: 'POST',
    body: JSON.stringify(body),
  };

  const response = await makeSingleRawRequestToDownstream(req);
  if (response.statusCode === 201) {
    return true;
  } else {
    logger.debug(
      { statusCode: response.statusCode, message: response.statusText },
      `Broker ${brokerConnectionIdentifier} app client ID ${brokerAppClientId} failed validation.`,
    );
    return false;
  }
};
