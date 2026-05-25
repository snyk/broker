import { prepareRequest } from '../../../../lib/broker-workload/prepareRequest';

jest.mock('../../../../lib/logs/logger');
jest.mock('../../../../lib/hybrid-sdk/client/scm', () => ({
  gitHubCommitSigningEnabled: () => false,
  gitHubTreeCheckNeeded: () => false,
  signGitHubCommit: jest.fn(),
  validateGitHubTreePayload: jest.fn(),
}));

describe('prepareRequest — downstream x-request-id mirror', () => {
  const baseResult = { url: 'https://example.com/path' } as any;
  const baseOptions = {
    config: { removeXForwardedHeaders: 'false', universalBrokerEnabled: false },
  } as any;
  const logContext: any = {};

  it('mirrors snyk-request-id onto x-request-id when x-request-id is absent', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const payload = {
      method: 'GET',
      url: '/path',
      headers: { 'snyk-request-id': id },
    };
    const { req } = await prepareRequest(
      { ...baseResult },
      payload,
      logContext,
      baseOptions,
      'tok',
      'client',
    );
    expect(req.headers['snyk-request-id']).toBe(id);
    expect(req.headers['x-request-id']).toBe(id);
  });

  it('preserves an existing x-request-id', async () => {
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const payload = {
      method: 'GET',
      url: '/path',
      headers: { 'snyk-request-id': id, 'x-request-id': 'preexisting-id' },
    };
    const { req } = await prepareRequest(
      { ...baseResult },
      payload,
      logContext,
      baseOptions,
      'tok',
      'client',
    );
    expect(req.headers['x-request-id']).toBe('preexisting-id');
    expect(req.headers['snyk-request-id']).toBe(id);
  });

  it('does not synthesise x-request-id when snyk-request-id is absent', async () => {
    const payload = {
      method: 'GET',
      url: '/path',
      headers: {},
    };
    const { req } = await prepareRequest(
      { ...baseResult },
      payload,
      logContext,
      baseOptions,
      'tok',
      'client',
    );
    expect(req.headers['x-request-id']).toBeUndefined();
  });
});
