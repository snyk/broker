import {
  getAccessToken,
  getCachedAccessToken,
  initOAuthClient,
  invalidateToken,
  isOAuthClientInitialized,
} from '../../../../lib/hybrid-sdk/client/auth/oauth';
import { log as logger } from '../../../../lib/logs/logger';
import type { Client as MetricsClient } from '../../../../lib/hybrid-sdk/client/metrics/client';

const nock = require('nock');

const API_HOST = 'https://api.example.test';
const TOKEN_PATH = '/oauth2/token';

function makeMockMetricsClient(): jest.Mocked<MetricsClient> {
  return {
    incrementBrokerClientMetric: jest.fn(),
    shutdown: jest.fn().mockResolvedValue(undefined),
    forceFlush: jest.fn().mockResolvedValue(undefined),
    setConnectionState: jest.fn(),
    recordReconnect: jest.fn(),
    recordProcessExit: jest.fn(),
    recordAuthRenewalFailure: jest.fn(),
    recordJwtRefreshFailure: jest.fn(),
    recordUncaughtException: jest.fn(),
    recordRequest: jest.fn(),
    recordDownstreamRequest: jest.fn(),
    recordDownstreamDuration: jest.fn(),
    recordDownstreamStatus: jest.fn(),
    recordConnectionDuration: jest.fn(),
    recordUpstreamResponseBytes: jest.fn(),
    incrementInflight: jest.fn(),
    decrementInflight: jest.fn(),
    recordPingLatency: jest.fn(),
  } as unknown as jest.Mocked<MetricsClient>;
}

function tokenResponse(
  overrides: Partial<{
    access_token: string;
    token_type: string;
    expires_in: number;
  }> = {},
) {
  return {
    access_token: 'tok-default',
    token_type: 'Bearer',
    expires_in: 3600,
    scope: 'broker',
    ...overrides,
  };
}

describe('client/auth/oauth (simple-oauth2)', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    nock.cleanAll();
    errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger);
  });

  afterEach(() => {
    nock.cleanAll();
    errorSpy.mockRestore();
  });

  it('fetches a token on first call and returns "<type> <token>"', async () => {
    initOAuthClient({
      apiHostname: API_HOST,
      clientId: 'cid',
      clientSecret: 'csecret',
    });
    expect(isOAuthClientInitialized()).toBe(true);

    const scope = nock(API_HOST)
      .post(TOKEN_PATH)
      .reply(200, tokenResponse({ access_token: 'first' }));

    const header = await getAccessToken();

    expect(header).toBe('Bearer first');
    expect(scope.isDone()).toBe(true);
  });

  it('returns the cached token synchronously via getCachedAccessToken', async () => {
    initOAuthClient({
      apiHostname: API_HOST,
      clientId: 'cid',
      clientSecret: 'csecret',
    });

    nock(API_HOST)
      .post(TOKEN_PATH)
      .reply(200, tokenResponse({ access_token: 'sync-cached' }));

    await getAccessToken();

    expect(getCachedAccessToken()).toBe('Bearer sync-cached');
    expect(nock.pendingMocks()).toHaveLength(0);
  });

  it('returns undefined from getCachedAccessToken when no token is cached', async () => {
    await jest.isolateModulesAsync(async () => {
      const mod = await import('../../../../lib/hybrid-sdk/client/auth/oauth');
      expect(mod.getCachedAccessToken()).toBeUndefined();
    });
  });

  it('returns the cached token on subsequent calls without re-fetching', async () => {
    initOAuthClient({
      apiHostname: API_HOST,
      clientId: 'cid',
      clientSecret: 'csecret',
    });

    nock(API_HOST)
      .post(TOKEN_PATH)
      .reply(200, tokenResponse({ access_token: 'cached' }));

    expect(await getAccessToken()).toBe('Bearer cached');
    expect(nock.isDone()).toBe(true);

    expect(await getAccessToken()).toBe('Bearer cached');
    expect(nock.pendingMocks()).toHaveLength(0);
  });

  it('re-fetches when the cached token is treated as expired', async () => {
    // A massive threshold makes any freshly-fetched token "expired" immediately.
    initOAuthClient({
      apiHostname: API_HOST,
      clientId: 'cid',
      clientSecret: 'csecret',
      expiryThresholdSeconds: 99_999,
    });

    nock(API_HOST)
      .post(TOKEN_PATH)
      .reply(200, tokenResponse({ access_token: 'one' }));
    nock(API_HOST)
      .post(TOKEN_PATH)
      .reply(200, tokenResponse({ access_token: 'two' }));

    expect(await getAccessToken()).toBe('Bearer one');
    expect(await getAccessToken()).toBe('Bearer two');
    expect(nock.pendingMocks()).toHaveLength(0);
  });

  it('records the metric and rethrows on fetch failure', async () => {
    const metricsClient = makeMockMetricsClient();
    initOAuthClient({
      apiHostname: API_HOST,
      clientId: 'cid',
      clientSecret: 'csecret',
      metricsClient,
    });

    nock(API_HOST).post(TOKEN_PATH).reply(500, {
      error: 'server_error',
      error_description: 'kaboom',
    });

    await expect(getAccessToken()).rejects.toThrow();

    expect(metricsClient.recordJwtRefreshFailure).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.anything() }),
      'Unable to retrieve JWT',
    );
  });

  it('does NOT fire recordJwtRefreshFailure when fetch succeeds', async () => {
    const metricsClient = makeMockMetricsClient();
    initOAuthClient({
      apiHostname: API_HOST,
      clientId: 'cid',
      clientSecret: 'csecret',
      metricsClient,
    });

    nock(API_HOST)
      .post(TOKEN_PATH)
      .reply(200, tokenResponse({ access_token: 'ok' }));

    await expect(getAccessToken()).resolves.toBe('Bearer ok');

    expect(metricsClient.recordJwtRefreshFailure).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('does not crash when metricsClient is omitted on a failed fetch', async () => {
    // No metricsClient — exercises the optional-chaining `metrics?.recordJwtRefreshFailure()`.
    initOAuthClient({
      apiHostname: API_HOST,
      clientId: 'cid',
      clientSecret: 'csecret',
    });

    nock(API_HOST).post(TOKEN_PATH).reply(500, {
      error: 'server_error',
      error_description: 'kaboom',
    });

    await expect(getAccessToken()).rejects.toThrow();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'Unable to retrieve JWT',
    );
  });

  it('reports uninitialized before initOAuthClient', async () => {
    await jest.isolateModulesAsync(async () => {
      const mod = await import('../../../../lib/hybrid-sdk/client/auth/oauth');
      expect(mod.isOAuthClientInitialized()).toBe(false);
    });
  });

  it('invalidateToken forces the next call to re-fetch', async () => {
    initOAuthClient({
      apiHostname: API_HOST,
      clientId: 'cid',
      clientSecret: 'csecret',
    });

    nock(API_HOST)
      .post(TOKEN_PATH)
      .reply(200, tokenResponse({ access_token: 'one' }));
    nock(API_HOST)
      .post(TOKEN_PATH)
      .reply(200, tokenResponse({ access_token: 'two' }));

    expect(await getAccessToken()).toBe('Bearer one');
    expect(await getAccessToken()).toBe('Bearer one'); // cached

    invalidateToken();

    expect(await getAccessToken()).toBe('Bearer two');
    expect(nock.pendingMocks()).toHaveLength(0);
  });

  it('throws when called before initOAuthClient', async () => {
    await jest.isolateModulesAsync(async () => {
      const mod = await import('../../../../lib/hybrid-sdk/client/auth/oauth');
      await expect(mod.getAccessToken()).rejects.toThrow(
        /OAuth client not initialized/,
      );
    });
  });

  it('getCachedAccessToken returns the still-valid token when within threshold and kicks off a background refresh', async () => {
    // Threshold larger than the issued lifetime — the freshly-fetched token is
    // immediately within the threshold but not actually expired (still valid
    // for ~3600s).
    initOAuthClient({
      apiHostname: API_HOST,
      clientId: 'cid',
      clientSecret: 'csecret',
      expiryThresholdSeconds: 7200,
    });

    nock(API_HOST)
      .post(TOKEN_PATH)
      .reply(200, tokenResponse({ access_token: 'first', expires_in: 3600 }));

    await getAccessToken();

    nock(API_HOST)
      .post(TOKEN_PATH)
      .reply(200, tokenResponse({ access_token: 'second', expires_in: 3600 }));

    // Still valid (expires in 3600s, > 0s), so returned synchronously.
    expect(getCachedAccessToken()).toBe('Bearer first');

    // Background refresh was kicked off. getAccessToken returns the in-flight
    // promise, so awaiting it deterministically waits for the refresh.
    expect(await getAccessToken()).toBe('Bearer second');
    expect(nock.pendingMocks()).toHaveLength(0);
  });

  it('getCachedAccessToken returns undefined when no token is cached and kicks off a background refresh', async () => {
    initOAuthClient({
      apiHostname: API_HOST,
      clientId: 'cid',
      clientSecret: 'csecret',
    });

    nock(API_HOST)
      .post(TOKEN_PATH)
      .reply(200, tokenResponse({ access_token: 'fresh', expires_in: 3600 }));

    // No prior fetch — cache is empty.
    expect(getCachedAccessToken()).toBeUndefined();

    // Background refresh was kicked off; await it via getAccessToken which
    // returns the in-flight promise.
    expect(await getAccessToken()).toBe('Bearer fresh');
    expect(nock.pendingMocks()).toHaveLength(0);
  });

  it('getCachedAccessToken returns undefined and does nothing when client not initialized', async () => {
    await jest.isolateModulesAsync(async () => {
      const mod = await import('../../../../lib/hybrid-sdk/client/auth/oauth');
      expect(mod.getCachedAccessToken()).toBeUndefined();
    });
  });

  it('deduplicates concurrent refreshes via a single in-flight fetch', async () => {
    initOAuthClient({
      apiHostname: API_HOST,
      clientId: 'cid',
      clientSecret: 'csecret',
    });

    // Only one HTTP response is mocked — if dedup is broken, the second
    // refresh will fail because no mock is left to satisfy it.
    nock(API_HOST)
      .post(TOKEN_PATH)
      .reply(200, tokenResponse({ access_token: 'shared' }));

    const [a, b, c] = await Promise.all([
      getAccessToken(),
      getAccessToken(),
      getAccessToken(),
    ]);

    expect(a).toBe('Bearer shared');
    expect(b).toBe('Bearer shared');
    expect(c).toBe('Bearer shared');
    expect(nock.pendingMocks()).toHaveLength(0);
  });
});
