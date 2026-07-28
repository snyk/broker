import { validateConnection } from '../../lib/hybrid-sdk/client/utils/connectionValidation';
import { ConnectionConfig } from '../../lib/hybrid-sdk/client/types/config';

const nock = require('nock');

describe('validateConnection (credentials-in-url)', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('does not mutate the connection config and keeps sending credentials across repeated calls', async () => {
    const originalUrl =
      'https://user:name@nexus.local/service/rest/v1/status/check';
    const expectedAuth = `Basic ${Buffer.from('user:name').toString('base64')}`;
    nock('https://nexus.local')
      .persist()
      .matchHeader('authorization', expectedAuth)
      .get('/service/rest/v1/status/check')
      .reply(() => [200, 'nexus - ok']);
    nock('https://nexus.local')
      .persist()
      .get('/service/rest/v1/status/check')
      .reply(() => [401, 'nexus - missing credentials']);

    const config = {
      validations: [{ url: originalUrl }],
    } as unknown as ConnectionConfig;

    const first = await validateConnection(config);
    const second = await validateConnection(config);

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
});
