import { log as logger } from '../../../../lib/logs/logger';
import { REDACTED } from '../../../../lib/logs/redact';
import { Plugin as GithubAppPlugin } from '../../../../lib/hybrid-sdk/client/brokerClientPlugins/plugins/githubServerAppAuth';
import { Plugin as ContainerRegistryPlugin } from '../../../../lib/hybrid-sdk/client/brokerClientPlugins/plugins/containerRegistryCredentialsFormatting';

const SECRET_PEM_PATH = '/etc/ssh/very-secret.pem';
const SECRET_GHA_TOKEN = 'gha-tok-do-not-leak-abc123';
const SECRET_JWT = 'jwt-do-not-leak-xyz789';
const SECRET_CR_PASSWORD = 'cr-pass-do-not-leak-pqr456';
const SECRET_CR_TOKEN = 'cr-tok-do-not-leak-stu789';
const SECRET_CR_CREDENTIALS = 'cr-creds-do-not-leak-vwx012';
const SECRET_GPG_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----DO_NOT_LEAK';
const SECRETS = [
  SECRET_PEM_PATH,
  SECRET_GHA_TOKEN,
  SECRET_JWT,
  SECRET_CR_PASSWORD,
  SECRET_CR_TOKEN,
  SECRET_CR_CREDENTIALS,
  SECRET_GPG_PRIVATE_KEY,
];

function assertNoSecretsLeaked(spies: jest.SpyInstance[]) {
  const allCalls = spies.flatMap((s) => s.mock.calls);
  expect(allCalls.length).toBeGreaterThan(0);
  const serialised = JSON.stringify(allCalls);
  for (const secret of SECRETS) {
    expect(serialised).not.toContain(secret);
  }
  // Sanity: the redaction marker should appear somewhere.
  expect(serialised).toContain(REDACTED);
}

describe('plugin call-site redaction', () => {
  let traceSpy: jest.SpyInstance;
  let debugSpy: jest.SpyInstance;

  beforeEach(() => {
    // No-arg call is bunyan's level check — must return true so the runtime
    // guard in abstractBrokerPlugin.preRequest doesn't short-circuit.
    traceSpy = jest
      .spyOn(logger, 'trace')
      .mockImplementation((...args: unknown[]) =>
        args.length === 0 ? true : undefined,
      );
    debugSpy = jest
      .spyOn(logger, 'debug')
      .mockImplementation((...args: unknown[]) =>
        args.length === 0 ? true : undefined,
      );
    jest.spyOn(logger, 'info').mockImplementation(() => {});
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
    jest.spyOn(logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const githubConnectionConfig = {
    friendlyName: 'gh-1',
    type: 'github-server-app',
    GITHUB_APP_ID: '123',
    GITHUB_APP_CLIENT_ID: '456',
    GITHUB_APP_INSTALLATION_ID: '789',
    GITHUB_APP_PRIVATE_PEM_PATH: SECRET_PEM_PATH,
  };
  const githubPluginConfig = {
    GHA_ACCESS_TOKEN: SECRET_GHA_TOKEN,
    JWT_TOKEN: SECRET_JWT,
    GPG_PRIVATE_KEY: SECRET_GPG_PRIVATE_KEY,
  };

  it('githubServerAppAuth.startUp does not leak credentials at trace level', async () => {
    const plugin = new GithubAppPlugin({});
    try {
      await plugin.startUp(
        'conn-1',
        githubConnectionConfig,
        githubPluginConfig,
      );
    } catch {
      // Expected — PEM path doesn't exist on disk.
    }
    assertNoSecretsLeaked([traceSpy, debugSpy]);
  });

  it('githubServerAppAuth.startUpContext does not leak credentials at trace or debug level', async () => {
    const plugin = new GithubAppPlugin({});
    try {
      await plugin.startUpContext(
        'conn-1',
        'ctx-1',
        githubConnectionConfig,
        githubPluginConfig,
      );
    } catch {
      // Expected — PEM file does not exist.
    }
    assertNoSecretsLeaked([traceSpy, debugSpy]);
  });

  it('abstractBrokerPlugin.preRequest does not leak credentials at trace level', async () => {
    // Container-registry plugin does not override preRequest, so it inherits
    // the abstract default — that's the call site this test exercises.
    const plugin = new ContainerRegistryPlugin({});
    await plugin.preRequest(
      crConnectionConfig,
      { url: '/', method: 'GET', headers: {}, body: undefined } as any,
      crPluginConfig as any,
    );
    assertNoSecretsLeaked([traceSpy, debugSpy]);
  });

  it('abstractBrokerPlugin.preRequest skips redaction work when trace level is off (hot-path perf guard)', async () => {
    // Override the trace spy so the level check returns false — simulating
    // production where LOG_LEVEL=info. Redaction (and the trace log) must not
    // run, otherwise we burn cycles deep-cloning the config on every request.
    traceSpy.mockImplementation(() => false);

    const plugin = new ContainerRegistryPlugin({});
    await plugin.preRequest(
      crConnectionConfig,
      { url: '/', method: 'GET', headers: {}, body: undefined } as any,
      crPluginConfig as any,
    );

    const callsWithArgs = traceSpy.mock.calls.filter((c) => c.length > 0);
    expect(callsWithArgs).toHaveLength(0);
  });

  const crConnectionConfig = {
    friendlyName: 'cr-1',
    type: 'docker-hub',
    CR_USERNAME: 'cr-user',
    CR_PASSWORD: SECRET_CR_PASSWORD,
    CR_TOKEN: SECRET_CR_TOKEN,
    CR_CREDENTIALS: SECRET_CR_CREDENTIALS,
  };
  const crPluginConfig = {
    CR_CREDENTIALS: SECRET_CR_CREDENTIALS,
  };

  it('containerRegistryCredentialsFormatting.startUp does not leak credentials at trace level', async () => {
    const plugin = new ContainerRegistryPlugin({});
    try {
      await plugin.startUp('conn-1', crConnectionConfig, crPluginConfig as any);
    } catch {
      // No-op — startUp may not throw with docker-hub creds, but be defensive.
    }
    assertNoSecretsLeaked([traceSpy, debugSpy]);
  });

  it('containerRegistryCredentialsFormatting.startUpContext does not leak credentials at debug level', async () => {
    const plugin = new ContainerRegistryPlugin({});
    try {
      await plugin.startUpContext(
        'conn-1',
        'ctx-1',
        crConnectionConfig,
        crPluginConfig as any,
      );
    } catch {
      // Expected if the method does further work that fails on stub config.
    }
    assertNoSecretsLeaked([traceSpy, debugSpy]);
  });

  it('concrete plugins also skip redaction work when their level is off (regression for the per-site guards)', async () => {
    traceSpy.mockImplementation(() => false);
    debugSpy.mockImplementation(() => false);

    const plugin = new ContainerRegistryPlugin({});
    try {
      await plugin.startUp('conn-1', crConnectionConfig, crPluginConfig as any);
      await plugin.startUpContext(
        'conn-1',
        'ctx-1',
        crConnectionConfig,
        crPluginConfig as any,
      );
    } catch {
      // ignore — we're only checking the guard short-circuits the log call
    }

    const traceWithArgs = traceSpy.mock.calls.filter((c) => c.length > 0);
    const debugWithArgs = debugSpy.mock.calls.filter((c) => c.length > 0);
    expect(traceWithArgs).toHaveLength(0);
    expect(debugWithArgs).toHaveLength(0);
  });
});
