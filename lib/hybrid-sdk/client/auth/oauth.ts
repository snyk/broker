import { AccessToken, ClientCredentials, ModuleOptions } from 'simple-oauth2';
import { log as logger } from '../../../logs/logger';
import type { Client as MetricsClient } from '../metrics/client';
import { emitError } from '../events';
import { BROKER_ERROR_CODES } from '../../common/types/telemetry';

export interface InitOAuthClientOptions {
  apiHostname: string;
  clientId: string;
  clientSecret: string;
  metricsClient?: MetricsClient;
  expiryThresholdSeconds?: number;
}

const DEFAULT_EXPIRY_THRESHOLD_SECONDS = 60;

let client: ClientCredentials | null = null;
let token: AccessToken | null = null;
let metrics: MetricsClient | undefined;
let thresholdSeconds = DEFAULT_EXPIRY_THRESHOLD_SECONDS;
let inFlightRefresh: Promise<AccessToken> | null = null;

export function isOAuthClientInitialized(): boolean {
  return client !== null;
}

export function initOAuthClient(opts: InitOAuthClientOptions): void {
  const config: ModuleOptions = {
    client: { id: opts.clientId, secret: opts.clientSecret },
    auth: {
      tokenHost: opts.apiHostname,
      tokenPath: '/oauth2/token',
    },
    options: {
      authorizationMethod: 'body',
    },
  };
  client = new ClientCredentials(config);
  metrics = opts.metricsClient;
  thresholdSeconds =
    opts.expiryThresholdSeconds ?? DEFAULT_EXPIRY_THRESHOLD_SECONDS;
  token = null;
  inFlightRefresh = null;
}

function refreshToken(): Promise<AccessToken> {
  if (!client) {
    return Promise.reject(
      new Error('OAuth client not initialized. Call initOAuthClient() first.'),
    );
  }
  if (inFlightRefresh) {
    return inFlightRefresh;
  }
  const activeClient = client;
  inFlightRefresh = (async () => {
    try {
      token = await activeClient.getToken({});
      logger.debug({}, 'Refreshed oauth access token');
      return token;
    } catch (err) {
      metrics?.recordJwtRefreshFailure();
      emitError({ errorCode: BROKER_ERROR_CODES.JWT_REFRESH_FAILED });
      logger.error({ err }, 'Unable to retrieve JWT');
      throw err;
    } finally {
      inFlightRefresh = null;
    }
  })();
  return inFlightRefresh;
}

async function ensureToken(): Promise<AccessToken> {
  if (!client) {
    throw new Error(
      'OAuth client not initialized. Call initOAuthClient() first.',
    );
  }
  if (token && !token.expired(thresholdSeconds)) {
    return token;
  }
  return refreshToken();
}

function formatAccessToken(accessToken: AccessToken): string {
  const raw = accessToken.token as { token_type: string; access_token: string };
  return `${raw.token_type} ${raw.access_token}`;
}

/**
 * Returns a cached token synchronously. Triggers a background refresh when the
 * cached token is within the expiry threshold (or absent/expired) so that
 * subsequent sync reads see a fresh token. When the token is within the
 * threshold but not yet expired, the still-valid token is returned for the
 * current caller — better than returning undefined and forcing an unauth'd
 * request.
 */
export function getCachedAccessToken(): string | undefined {
  if (!client) {
    return undefined;
  }
  if (!token || token.expired(0)) {
    void refreshToken().catch(() => {
      /* failure already logged and recorded in refreshToken */
    });
    return undefined;
  }
  if (token.expired(thresholdSeconds)) {
    void refreshToken().catch(() => {
      /* failure already logged and recorded in refreshToken */
    });
  }
  return formatAccessToken(token);
}

export async function getAccessToken(): Promise<string> {
  return formatAccessToken(await ensureToken());
}

export function invalidateToken(): void {
  token = null;
}
