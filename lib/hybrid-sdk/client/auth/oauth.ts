import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import { PostFilterPreparedRequest } from '../../../broker-workload/prepareRequest';
import { makeRequestToDownstream } from '../../http/request';
import { log as logger } from '../../../logs/logger';
import type { Client as MetricsClient } from '../metrics/client';

export const OAUTH_TOKEN_REJECTED_EVENT = 'token-rejected';
export const oauthEvents = new EventEmitter();

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
  requestId: string = uuid(),
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
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Snyk-Request-Id': requestId,
      },
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
    logger.error({ err, requestId }, 'Unable to retrieve JWT');
  }
}

const JWT_REFRESH_RETRY_ON_FAILURE_MS = 30_000;

let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let inflightRefresh: Promise<void> | null = null;

export const stopJwtRefresh = () => {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
};

const startRefreshJwt = (
  clientConfig,
  clientId,
  clientSecret,
  metricsClient?: MetricsClient,
) => {
  if (inflightRefresh) return;
  stopJwtRefresh();
  inflightRefresh = refreshJwt(
    clientConfig,
    clientId,
    clientSecret,
    metricsClient,
  ).finally(() => {
    inflightRefresh = null;
  });
};

const refreshJwt = async (
  clientConfig,
  clientId,
  clientSecret,
  metricsClient?: MetricsClient,
) => {
  const requestId = uuid();
  logger.debug({ requestId }, 'Refreshing oauth access token');
  let nextDelayMs: number;
  try {
    const newJwt = await fetchAndUpdateJwt(
      clientConfig.apiHostname,
      clientId,
      clientSecret,
      requestId,
    );
    if (!newJwt) {
      throw new Error('Error retrieving new JWT:undefined.');
    }
    setAuthConfigKey('accessToken', {
      expiresIn: newJwt.expiresIn,
      authHeader: newJwt.authHeader,
    });
    nextDelayMs =
      clientConfig.AUTH_EXPIRATION_OVERRIDE ?? (newJwt.expiresIn - 60) * 1000;
  } catch (err) {
    metricsClient?.recordJwtRefreshFailure();
    logger.error({ err, requestId }, 'Error retrieving new JWT');
    nextDelayMs =
      clientConfig.AUTH_EXPIRATION_OVERRIDE ?? JWT_REFRESH_RETRY_ON_FAILURE_MS;
  }
  refreshTimer = setTimeout(() => {
    startRefreshJwt(clientConfig, clientId, clientSecret, metricsClient);
  }, nextDelayMs);
};

export const setfetchAndUpdateJwt = async (
  clientConfig,
  clientId,
  clientSecret,
  metricsClient?: MetricsClient,
) => {
  stopJwtRefresh();
  oauthEvents.removeAllListeners(OAUTH_TOKEN_REJECTED_EVENT);
  oauthEvents.on(OAUTH_TOKEN_REJECTED_EVENT, () => {
    startRefreshJwt(clientConfig, clientId, clientSecret, metricsClient);
  });
  const requestId = uuid();
  const newJwt = await fetchAndUpdateJwt(
    clientConfig.apiHostname,
    clientId,
    clientSecret,
    requestId,
  );
  logger.debug({ requestId }, 'Setting auth updater.');
  if (newJwt) {
    refreshTimer = setTimeout(() => {
      startRefreshJwt(clientConfig, clientId, clientSecret, metricsClient);
    }, clientConfig.AUTH_EXPIRATION_OVERRIDE ?? (newJwt.expiresIn - 60) * 1000);
  }
};
