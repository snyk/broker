import { AccessToken, ClientCredentials, ModuleOptions } from 'simple-oauth2';
import { log as logger } from '../../../logs/logger';
import type { Client as MetricsClient } from '../metrics/client';

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
  try {
    token = await client.getToken({});
    logger.debug({}, 'Refreshed oauth access token');
    return token;
  } catch (err) {
    metrics?.recordJwtRefreshFailure();
    logger.error({ err }, 'Unable to retrieve JWT');
    throw err;
  }
}

function formatAccessToken(accessToken: AccessToken): string {
  const raw = accessToken.token as { token_type: string; access_token: string };
  return `${raw.token_type} ${raw.access_token}`;
}

/** Returns a cached token synchronously when still valid; undefined if a fetch is required. */
export function getCachedAccessToken(): string | undefined {
  if (!token || token.expired(thresholdSeconds)) {
    return undefined;
  }
  return formatAccessToken(token);
}

export async function getAccessToken(): Promise<string> {
  return formatAccessToken(await ensureToken());
}

export function invalidateToken(): void {
  token = null;
}
