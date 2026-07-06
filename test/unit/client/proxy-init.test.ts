// Mock global-agent so bootstrap() cannot patch shared http/https and leak
// into sibling test files.
jest.mock('global-agent', () => ({ bootstrap: jest.fn() }));

import { bootstrap } from 'global-agent';
import {
  initGlobalProxy,
  normalizeProxyEnv,
} from '../../../lib/hybrid-sdk/common/utils/proxy';

const bootstrapMock = bootstrap as unknown as jest.Mock;

const PROXY_ENV_KEYS = [
  'HTTP_PROXY',
  'http_proxy',
  'HTTPS_PROXY',
  'https_proxy',
  'NO_PROXY',
  'no_proxy',
];

describe('common/utils/proxy initGlobalProxy', () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = {};
    for (const key of PROXY_ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    bootstrapMock.mockClear();
  });

  afterEach(() => {
    for (const key of PROXY_ENV_KEYS) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  });

  it('bootstraps global-agent when a proxy applies to the url', () => {
    process.env.HTTPS_PROXY = 'http://proxy:10224';

    initGlobalProxy('https://api.snyk.io');

    expect(bootstrapMock).toHaveBeenCalledWith({
      environmentVariableNamespace: '',
    });
  });

  it('does not bootstrap when the url is excluded via NO_PROXY', () => {
    process.env.HTTPS_PROXY = 'http://proxy:10224';
    process.env.NO_PROXY = 'api.snyk.io';

    initGlobalProxy('https://api.snyk.io');

    expect(bootstrapMock).not.toHaveBeenCalled();
  });

  it('does not bootstrap when no proxy env is configured', () => {
    initGlobalProxy('https://api.snyk.io');

    expect(bootstrapMock).not.toHaveBeenCalled();
  });

  it('does not bootstrap when the url is undefined', () => {
    process.env.HTTPS_PROXY = 'http://proxy:10224';

    initGlobalProxy(undefined);

    expect(bootstrapMock).not.toHaveBeenCalled();
  });

  it('normalizes lowercase proxy env vars to uppercase', () => {
    process.env.https_proxy = 'http://proxy:10224';

    normalizeProxyEnv();

    expect(process.env.HTTPS_PROXY).toBe('http://proxy:10224');
  });
});
