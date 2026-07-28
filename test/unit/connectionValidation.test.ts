import { validateConnection } from '../../lib/hybrid-sdk/client/utils/connectionValidation';
import { ConnectionConfig } from '../../lib/hybrid-sdk/client/types/config';

const nock = require('nock');

describe('validateConnection (credentials-in-url)', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('does not mutate the connection config and keeps sending credentials across repeated calls', async () => {
    // Regression test for the state-mutation bug (ACC-3477). The universal
    // systemcheck handler validates each connection against the SHARED, cached
    // connection config returned by getConfigForConnections(). For
    // credentials-in-url connections (nexus, nexus2, artifactory) the default
    // auth branch used to strip the embedded credentials and write the result
    // back into `validation.url` — mutating that shared cache in place. The
    // first call authenticated; every subsequent call parsed a creds-free URL,
    // sent no Authorization header, and failed (e.g. Nexus 403/401).
    const originalUrl =
      'https://user:name@nexus.local/service/rest/v1/status/check';
    const expectedAuth = `Basic ${Buffer.from('user:name').toString('base64')}`;

    // Reply 200 only when the derived Basic auth header is present; otherwise
    // 401 — exactly the failure the bug produced on the second call. Both
    // interceptors cover the path, so there is never a network fall-through.
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
