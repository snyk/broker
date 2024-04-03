import { makeRequestToDownstream } from '../../common/http/request';
import { PostFilterPreparedRequest } from '../../common/relay/prepareRequest';
import { log as logger } from '../../logs/logger';
interface tokenExchangeResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export async function fetchJwt(
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
    const accessToken = JSON.parse(oauthResponse.body) as tokenExchangeResponse;
    const jwt = accessToken.access_token;
    const type = accessToken.token_type;
    const expiresIn = accessToken.expires_in;

    return { expiresIn: expiresIn, authHeader: `${type} ${jwt}` };
  } catch (err) {
    logger.error({ err }, 'Unable to retrieve JWT');
  }
}
