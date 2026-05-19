import {
  fetchAndUpdateJwt,
  setfetchAndUpdateJwt,
  getAuthConfig,
} from '../../../../lib/hybrid-sdk/client/auth/oauth';
import { log as logger } from '../../../../lib/logs/logger';
import type { Client as MetricsClient } from '../../../../lib/hybrid-sdk/client/metrics/client';

const nock = require('nock');

const API_HOST = 'https://api.example.test';

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

describe('client/auth/oauth — JWT refresh observability', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    nock.cleanAll();
    errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger);
  });

  afterEach(async () => {
    nock.cleanAll();
    await new Promise((r) => setTimeout(r, 50));
    errorSpy.mockRestore();
  });

  async function waitFor(
    predicate: () => boolean,
    timeoutMs = 2000,
    intervalMs = 10,
  ): Promise<void> {
    const start = Date.now();
    while (!predicate()) {
      if (Date.now() - start > timeoutMs) {
        throw new Error(`waitFor: timed out after ${timeoutMs}ms`);
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  describe('fetchAndUpdateJwt', () => {
    it('logs failures with a structured {err} field (not a template string)', async () => {
      nock(API_HOST)
        .post('/oauth2/token')
        .reply(
          500,
          JSON.stringify({
            error: 'server_error',
            error_description: 'kaboom',
          }),
        );

      const result = await fetchAndUpdateJwt(API_HOST, 'cid', 'csecret');

      expect(result).toBeUndefined();
      expect(errorSpy).toHaveBeenCalledTimes(1);

      const [fields, message] = errorSpy.mock.calls[0];
      expect(typeof fields).toBe('object');
      expect(fields).toHaveProperty('err');
      expect(fields.err).toBeInstanceOf(Error);
      expect(message).toBe('Unable to retrieve JWT');
    });

    it('returns the parsed token on success', async () => {
      nock(API_HOST).post('/oauth2/token').reply(200, {
        access_token: 'tok-123',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'broker',
      });

      const result = await fetchAndUpdateJwt(API_HOST, 'cid', 'csecret');

      expect(result).toEqual({
        expiresIn: 3600,
        authHeader: 'Bearer tok-123',
      });
      expect(getAuthConfig().accessToken).toEqual(result);
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  describe('refreshJwt failure path (via setfetchAndUpdateJwt + timers)', () => {
    it('fires recordJwtRefreshFailure and logs structured {err} when refresh fails', async () => {
      const metricsClient = makeMockMetricsClient();

      nock(API_HOST).post('/oauth2/token').reply(200, {
        access_token: 'first',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'broker',
      });
      nock(API_HOST)
        .post('/oauth2/token')
        .reply(
          500,
          JSON.stringify({
            error: 'server_error',
            error_description: 'still down',
          }),
        );

      await setfetchAndUpdateJwt(
        { apiHostname: API_HOST, AUTH_EXPIRATION_OVERRIDE: 10 },
        'cid',
        'csecret',
        metricsClient,
      );

      expect(metricsClient.recordJwtRefreshFailure).not.toHaveBeenCalled();
      await waitFor(
        () =>
          (metricsClient.recordJwtRefreshFailure as jest.Mock).mock.calls
            .length > 0,
      );

      expect(metricsClient.recordJwtRefreshFailure).toHaveBeenCalledTimes(1);
      const refreshErrorCall = errorSpy.mock.calls.find(
        ([, msg]) => msg === 'Error retrieving new JWT',
      );
      expect(refreshErrorCall).toBeDefined();
      const [fields] = refreshErrorCall!;
      expect(typeof fields).toBe('object');
      expect(fields).toHaveProperty('err');
      expect(fields.err).toBeInstanceOf(Error);
      expect(refreshErrorCall![1]).toBe('Error retrieving new JWT');
    });

    it('does NOT fire recordJwtRefreshFailure when refresh succeeds', async () => {
      const metricsClient = makeMockMetricsClient();

      // Both calls succeed.
      nock(API_HOST).post('/oauth2/token').reply(200, {
        access_token: 'first',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'broker',
      });
      nock(API_HOST).post('/oauth2/token').reply(200, {
        access_token: 'second',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'broker',
      });

      await setfetchAndUpdateJwt(
        { apiHostname: API_HOST, AUTH_EXPIRATION_OVERRIDE: 10 },
        'cid',
        'csecret',
        metricsClient,
      );

      // Wait for the refresh setTimeout to fire and the second token to land.
      await waitFor(
        () => getAuthConfig().accessToken?.authHeader === 'Bearer second',
      );

      expect(metricsClient.recordJwtRefreshFailure).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('does not crash when metricsClient is omitted (backwards compatibility)', async () => {
      nock(API_HOST).post('/oauth2/token').reply(200, {
        access_token: 'first',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'broker',
      });
      nock(API_HOST).post('/oauth2/token').reply(500, '{}');

      // No fourth argument — exercises the optional-chaining call site.
      await expect(
        setfetchAndUpdateJwt(
          { apiHostname: API_HOST, AUTH_EXPIRATION_OVERRIDE: 10 },
          'cid',
          'csecret',
        ),
      ).resolves.toBeUndefined();

      // Wait long enough for the scheduled refresh to fire and fail.
      // The assertion is structural: the catch block ran without throwing.
      await waitFor(() =>
        errorSpy.mock.calls.some(
          ([, msg]) => msg === 'Error retrieving new JWT',
        ),
      );
    });
  });
});
