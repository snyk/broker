import nock from 'nock';
import { validateConnection } from '../../lib/hybrid-sdk/client/utils/connectionValidation';
import { ConnectionConfig } from '../../lib/hybrid-sdk/client/types/config';

describe('client/utils/connectionValidation.ts', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  describe('validateConnection()', () => {
    it('should not mutate the connection config and should keep sending credentials across repeated calls', async () => {
      const originalUrl =
        'https://user:name@nexus.local/service/rest/v1/status/check';
      const expectedAuth = `Basic ${Buffer.from('user:name').toString(
        'base64',
      )}`;
      const scope = nock('https://nexus.local')
        .matchHeader('authorization', expectedAuth)
        .get('/service/rest/v1/status/check')
        .twice()
        .reply(() => [200, 'nexus - ok']);

      const config = {
        validations: [{ url: originalUrl }],
      } as unknown as ConnectionConfig;

      const first = await validateConnection(config);
      const second = await validateConnection(config);
      scope.done();

      // The shared config's url must be left untouched — this is the mutation
      // the fix prevents.
      expect(config.validations[0].url).toBe(originalUrl);

      // Both calls authenticate (200 requires the matchHeader interceptor).
      // Before the fix, the second call would be 401 -> passing false.
      expect(first.passing).toBe(true);
      expect(second.passing).toBe(true);
      expect((first.data[0] as any).statusCode).toBe(200);
      expect((second.data[0] as any).statusCode).toBe(200);
    });

    it('should use the configured header name', async () => {
      let receivedHeaders: Record<string, string> | undefined;
      const scope = nock('https://gitlab.local')
        .get('/api/v4/user')
        .reply(function (this: any) {
          receivedHeaders = this.req.headers;
          return [200, 'gitlab - ok'];
        });

      const config = {
        validations: [
          {
            url: 'https://gitlab.local/api/v4/user',
            auth: {
              type: 'header',
              name: 'private-token',
              value: 'gitlab-token',
            },
          },
        ],
      } as ConnectionConfig;

      const result = await validateConnection(config);
      scope.done();

      expect(result.passing).toBe(true);
      expect(receivedHeaders?.['private-token']).toBe('gitlab-token');
      expect(receivedHeaders?.authorization).toBeUndefined();
    });

    it('should default to the Authorization header when no name is configured', async () => {
      let receivedHeaders: Record<string, string> | undefined;
      const scope = nock('https://github.local')
        .get('/user')
        .reply(function (this: any) {
          receivedHeaders = this.req.headers;
          return [200, 'github - ok'];
        });

      const config = {
        validations: [
          {
            url: 'https://github.local/user',
            auth: {
              type: 'header',
              value: 'token github-token',
            },
          },
        ],
      } as ConnectionConfig;

      const result = await validateConnection(config);
      scope.done();

      expect(result.passing).toBe(true);
      expect(receivedHeaders?.authorization).toBe('token github-token');
    });
  });
});
