import { PostFilterPreparedRequest } from '../../../broker-workload/prepareRequest';
import { makeRequestToDownstream } from '../../http/request';
import { log as logger } from '../../../logs/logger';

interface tokenExchangeResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

const authConfig: Record<string, any> = {};

export const getAuthConfig = () => {
  return authConfig;
};

export const setAuthConfigKey = (key: string, value: unknown) => {
  authConfig[key] = value;
};

export async function fetchAndUpdateJwt(
  apiHostname: string,
  clientId: string,
  clientSecret: string,
) {
  try {
    const data = {
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    };
    const formData = new URLSearchParams(data);

    const request: PostFilterPreparedRequest = {
      url: `${apiHostname}/oauth2/token`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      body: formData.toString(),
    };
    const oauthResponse = await makeRequestToDownstream(request);
    if (oauthResponse.statusCode != 200) {
      const errorBody = JSON.parse(oauthResponse.body);
      throw new Error(
        `${oauthResponse.statusCode}-${errorBody.error}:${errorBody.error_description}`,
      );
    }
    const accessTokenJSON = JSON.parse(
      oauthResponse.body,
    ) as tokenExchangeResponse;
    const jwt = accessTokenJSON.access_token;
    const type = accessTokenJSON.token_type;
    const expiresIn = accessTokenJSON.expires_in;

    setAuthConfigKey('accessToken', {
      expiresIn: expiresIn,
      authHeader: `${type} ${jwt}`,
    });
    return { expiresIn: expiresIn, authHeader: `${type} ${jwt}` };
  } catch (err) {
    logger.error({ err }, 'Unable to retrieve JWT');
  }
}

const refreshJwt = async (clientConfig, clientId, clientSecret) => {
  logger.debug({}, 'Refreshing oauth access token');
  try {
    const newJwt = await fetchAndUpdateJwt(
      clientConfig.apiHostname,
      clientId,
      clientSecret,
    );
    if (!newJwt) {
      throw new Error('Error retrieving new JWT:undefined.');
    }
    setAuthConfigKey('accessToken', {
      expiresIn: newJwt.expiresIn,
      authHeader: newJwt.authHeader,
    });
    setTimeout(async () => {
      refreshJwt(clientConfig, clientId, clientSecret);
    }, clientConfig.AUTH_EXPIRATION_OVERRIDE ?? (newJwt.expiresIn - 60) * 1000);
  } catch (err) {
    logger.error(`Error retrieving new JWT ${err}`);
  }
};

export const setfetchAndUpdateJwt = async (
  clientConfig,
  clientId,
  clientSecret,
) => {
  const newJwt = await fetchAndUpdateJwt(
    clientConfig.apiHostname,
    clientId,
    clientSecret,
  );
  logger.debug({}, 'Setting auth updater.');
  if (newJwt) {
    setTimeout(async () => {
      refreshJwt(clientConfig, clientId, clientSecret);
    }, clientConfig.AUTH_EXPIRATION_OVERRIDE ?? (newJwt.expiresIn - 60) * 1000);
  }
};
