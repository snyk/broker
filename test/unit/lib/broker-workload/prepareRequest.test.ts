import { prepareRequest } from '../../../../lib/broker-workload/prepareRequest';
import {
  gitHubTreeCheckNeeded,
  validateGitHubTreePayload,
} from '../../../../lib/hybrid-sdk/client/scm';

jest.mock('../../../../lib/logs/logger');
jest.mock('../../../../lib/hybrid-sdk/client/scm', () => ({
  gitHubCommitSigningEnabled: jest.fn(() => false),
  gitHubTreeCheckNeeded: jest.fn(() => false),
  signGitHubCommit: jest.fn(),
  validateGitHubTreePayload: jest.fn(),
}));

const mockGitHubTreeCheckNeeded = jest.mocked(gitHubTreeCheckNeeded);
const mockValidateGitHubTreePayload = jest.mocked(validateGitHubTreePayload);

beforeEach(() => {
  jest.clearAllMocks();
  mockGitHubTreeCheckNeeded.mockReturnValue(false);
  mockValidateGitHubTreePayload.mockReset();
});

describe('prepareRequest — requestId propagation', () => {
  const baseResult = { url: 'https://example.com/path' } as any;
  const baseOptions = {
    config: { removeXForwardedHeaders: 'false', universalBrokerEnabled: false },
  } as any;
  const logContext: any = {};

  it('propagates requestId from payload onto the prepared request', async () => {
    const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const payload = {
      method: 'GET',
      url: '/path',
      headers: { 'snyk-request-id': id },
      requestId: id,
    };
    const { req } = await prepareRequest(
      { ...baseResult },
      payload,
      logContext,
      baseOptions,
      'tok',
      'client',
    );
    expect(req.requestId).toBe(id);
  });

  it('req.requestId matches snyk-request-id header after prepare', async () => {
    const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const payload = {
      method: 'POST',
      url: '/path',
      headers: { 'snyk-request-id': id },
      requestId: id,
    };
    const { req } = await prepareRequest(
      { ...baseResult },
      payload,
      logContext,
      baseOptions,
      'tok',
      'client',
    );
    expect(req.requestId).toBe(id);
    expect(req.headers['snyk-request-id']).toBe(id);
  });
});

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

describe('prepareRequest — GitHub create tree validation', () => {
  const baseResult = {
    url: 'https://api.github.com/repos/owner/repo/git/trees',
  } as any;
  const baseOptions = {
    config: { removeXForwardedHeaders: 'false', universalBrokerEnabled: false },
  } as any;
  const logContext: any = {};
  const treeBody = JSON.stringify({
    base_tree: '0000000000000000000000000000000000000000',
    tree: [
      {
        path: 'config/malicious_link',
        mode: '120000',
        type: 'blob',
        content: '/etc/passwd',
      },
    ],
  });

  it('returns the existing preparation error when tree validation fails', async () => {
    mockGitHubTreeCheckNeeded.mockReturnValue(true);
    mockValidateGitHubTreePayload.mockImplementation(() => {
      throw new Error(
        'Symlinks are not allowed in GitHub tree payload: config/malicious_link',
      );
    });
    const payload = {
      method: 'POST',
      url: '/repos/owner/repo/git/trees',
      headers: {},
      body: treeBody,
    };

    const { error } = await prepareRequest(
      { ...baseResult },
      payload,
      logContext,
      baseOptions,
      'tok',
      'client',
    );

    expect(error).toEqual({
      status: 401,
      errorMsg:
        'Symlinks are not allowed in GitHub tree payload: config/malicious_link',
    });
    expect(mockValidateGitHubTreePayload).toHaveBeenCalledWith(treeBody);
  });

  it('returns no preparation error when tree validation succeeds', async () => {
    mockGitHubTreeCheckNeeded.mockReturnValue(true);
    const payload = {
      method: 'POST',
      url: '/repos/owner/repo/git/trees',
      headers: {},
      body: treeBody,
    };

    const { error } = await prepareRequest(
      { ...baseResult },
      payload,
      logContext,
      baseOptions,
      'tok',
      'client',
    );

    expect(error).toBeNull();
    expect(mockValidateGitHubTreePayload).toHaveBeenCalledWith(treeBody);
  });

  it('does not validate tree payloads when the commit-signing check is disabled', async () => {
    const payload = {
      method: 'POST',
      url: '/repos/owner/repo/git/trees',
      headers: {},
      body: treeBody,
    };

    const { error } = await prepareRequest(
      { ...baseResult },
      payload,
      logContext,
      baseOptions,
      'tok',
      'client',
    );

    expect(error).toBeNull();
    expect(mockValidateGitHubTreePayload).not.toHaveBeenCalled();
  });
});
