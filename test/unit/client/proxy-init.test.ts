import {
  initGlobalProxy,
  normalizeProxyEnv,
} from '../../../lib/hybrid-sdk/common/utils/proxy';

const PROXY_ENV_KEYS = [
  'HTTP_PROXY',
  'http_proxy',
  'HTTPS_PROXY',
  'https_proxy',
  'NO_PROXY',
  'no_proxy',
];

// global-agent records its config on global.GLOBAL_AGENT once bootstrap() runs;
// its presence is the observable signal that proxy support was installed.
const globalAgent = () => (global as any).GLOBAL_AGENT;

describe('common/utils/proxy initGlobalProxy', () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = {};
    for (const key of PROXY_ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    delete (global as any).GLOBAL_AGENT;
  });

  afterEach(() => {
    for (const key of PROXY_ENV_KEYS) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
    delete (global as any).GLOBAL_AGENT;
  });

  it('bootstraps global-agent when a proxy applies to the url', () => {
    process.env.HTTP_PROXY = 'http://proxy:10224';
    process.env.HTTPS_PROXY = 'http://proxy:10224';

    initGlobalProxy('https://api.snyk.io');

    expect(globalAgent()).toBeDefined();
  });

  it('does not bootstrap when the url is excluded via NO_PROXY', () => {
    process.env.HTTP_PROXY = 'http://proxy:10224';
    process.env.HTTPS_PROXY = 'http://proxy:10224';
    process.env.NO_PROXY = 'api.snyk.io';

    initGlobalProxy('https://api.snyk.io');

    expect(globalAgent()).toBeUndefined();
  });

  it('is a no-op when no proxy env is configured', () => {
    expect(() => initGlobalProxy('https://api.snyk.io')).not.toThrow();
    expect(globalAgent()).toBeUndefined();
  });

  it('can be called repeatedly without throwing (idempotent)', () => {
    process.env.HTTPS_PROXY = 'http://proxy:10224';

    initGlobalProxy('https://api.snyk.io');
    expect(() => initGlobalProxy('https://api.snyk.io')).not.toThrow();
    expect(globalAgent()).toBeDefined();
  });

  it('normalizes lowercase proxy env vars to uppercase', () => {
    process.env.https_proxy = 'http://proxy:10224';

    normalizeProxyEnv();

    expect(process.env.HTTPS_PROXY).toBe('http://proxy:10224');
  });
});
