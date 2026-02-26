process.env.FOO = 'bar';
process.env.BROKER_TOKEN = '1234';
process.env.BITBUCKET_PASSWORD_POOL = '1234, 5678';
process.env.GITHUB_TOKEN_POOL = '9012, 3456';
process.env.FOO_BAR = '$FOO/bar';
process.env.GITHUB_USERNAME = 'git';
process.env.GITHUB_PASSWORD_POOL = '9012, 3456';
process.env.GITHUB_AUTH = 'Basic $GITHUB_USERNAME:$GITHUB_PASSWORD';
process.env.COMPLEX_TOKEN = '1234$$%#@!$!$@$$$';

import {
  getConfig,
  loadBrokerConfig,
} from '../../lib/hybrid-sdk/common/config/config';
import {
  getConfigForType,
  getConfigForIdentifier,
} from '../../lib/hybrid-sdk/common/config/universal';

describe('config', () => {
  beforeAll(async () => {
    await loadBrokerConfig();
  });
  it('contain application config', async () => {
    const foo = process.env.FOO;
    const token = process.env.BROKER_TOKEN;
    const bitbucketTokens = ['1234', '5678'];
    const githubTokens = ['9012', '3456'];
    const complexToken = process.env.COMPLEX_TOKEN;

    await loadBrokerConfig();
    const config = getConfig();

    expect(config.foo).toEqual(foo);
    expect(config.brokerToken).toEqual(token);
    expect(config.fooBar).toEqual('bar/bar');
    expect(config.complexToken).toEqual(complexToken);
    expect(config.bitbucketPasswordPool).toEqual(bitbucketTokens);
    expect(config.BITBUCKET_PASSWORD_POOL).toEqual(bitbucketTokens);
    expect(config.githubTokenPool).toEqual(githubTokens);
    expect(config.GITHUB_TOKEN_POOL).toEqual(githubTokens);
    expect(config.githubAuthPool).toEqual(['Basic git:9012', 'Basic git:3456']);
    expect(config.GITHUB_AUTH_POOL).toEqual([
      'Basic git:9012',
      'Basic git:3456',
    ]);
  });

  it('getConfigType', async () => {
    await loadBrokerConfig();
    const configData = getConfigForType('github');

    expect(configData).toEqual({
      BROKER_CLIENT_VALIDATION_AUTHORIZATION_HEADER: 'token $GITHUB_TOKEN',
      BROKER_CLIENT_VALIDATION_URL: 'https://$GITHUB_API/user',
      BROKER_HEALTHCHECK_PATH: '/healthcheck',
      BROKER_SERVER_URL: 'https://broker.snyk.io',
      GITHUB: 'github.com',
      GITHUB_API: 'api.github.com',
      GITHUB_GRAPHQL: 'api.github.com',
      GITHUB_RAW: 'raw.githubusercontent.com',
      GIT_PASSWORD: '$GITHUB_TOKEN',
      GIT_URL: '$GITHUB',
      GIT_USERNAME: 'x-access-token',
    });
  });

  it('getConfigType with multiple replacements', async () => {
    process.env.UNIVERSAL_BROKER_ENABLED = 'true';
    process.env.SERVICE_ENV = 'universaltest';
    process.env.GITHUB_TOKEN = '123';
    process.env.GITLAB_TOKEN = '123';
    process.env.AZURE_REPOS_TOKEN = '123';
    process.env.AZURE_REPOS_HOST = 'hostname';
    process.env.AZURE_REPOS_ORG = 'org';
    process.env.BROKER_TOKEN_1 = 'dummyBrokerIdentifier';
    process.env.BROKER_TOKEN_2 = 'dummyBrokerIdentifier2';
    process.env.BROKER_TOKEN_3 = 'dummyBrokerIdentifier3';
    process.env.BROKER_TOKEN_4 = 'brokertoken4';
    process.env.JIRA_PAT = 'jirapat';
    process.env.JIRA_HOSTNAME = 'hostname';
    process.env.CLIENT_ID = 'clienid';
    process.env.CLIENT_SECRET = 'clientsecret';

    await loadBrokerConfig();
    const configData = getConfigForIdentifier(
      'dummyBrokerIdentifier3',
      getConfig(),
    );

    expect(configData).toEqual({
      AZURE_REPOS_HOST: 'hostname',
      AZURE_REPOS_ORG: 'org',
      AZURE_REPOS_TOKEN: '123',
      AZURE_REPOS_USER_ENTITLEMENTS_HOST: 'vsaex.hostname',
      BROKER_CLIENT_VALIDATION_BASIC_AUTH: 'PAT:123',
      BROKER_CLIENT_VALIDATION_URL:
        'https://hostname/org/_apis/git/repositories',
      BROKER_SERVER_URL: 'https://broker.dev.snyk.io',
      BROKER_HA_MODE_ENABLED: 'false',
      BROKER_DISPATCHER_BASE_URL: 'https://api.dev.snyk.io',
      BROKER_HEALTHCHECK_PATH: '/healthcheck',
      GIT_PASSWORD: '123',
      GIT_URL: 'hostname/org',
      GIT_USERNAME: 'PAT',
      id: '3',
      identifier: 'dummyBrokerIdentifier3',
      type: 'azure-repos',
    });
    delete process.env.CLIENT_ID;
    delete process.env.CLIENT_SECRET;
  });

  it('getConfigByidentifier', async () => {
    process.env.UNIVERSAL_BROKER_ENABLED = 'true';
    process.env.SERVICE_ENV = 'universaltest';
    process.env.GITHUB_TOKEN = '123';
    process.env.GITLAB_TOKEN = '123';
    process.env.BROKER_TOKEN_1 = 'dummyBrokerIdentifier';
    process.env.BROKER_TOKEN_2 = 'dummyBrokerIdentifier2';
    process.env.BROKER_TOKEN_3 = 'dummyBrokerIdentifier3';
    process.env.BROKER_TOKEN_4 = 'brokertoken4';
    process.env.JIRA_PAT = 'jirapat';
    process.env.JIRA_HOSTNAME = 'hostname';
    process.env.CLIENT_ID = 'clienid';
    process.env.CLIENT_SECRET = 'clientsecret';
    await loadBrokerConfig();
    const configData = getConfigForIdentifier(
      'dummyBrokerIdentifier',
      getConfig(),
    );
    expect(configData).toEqual({
      BROKER_CLIENT_VALIDATION_AUTHORIZATION_HEADER: 'token 123',
      BROKER_CLIENT_VALIDATION_URL: 'https://api.github.com/user',
      BROKER_SERVER_URL: 'https://broker.dev.snyk.io',
      BROKER_HA_MODE_ENABLED: 'false',
      BROKER_DISPATCHER_BASE_URL: 'https://api.dev.snyk.io',
      BROKER_HEALTHCHECK_PATH: '/healthcheck',
      GITHUB: 'github.com',
      GITHUB_API: 'api.github.com',
      GITHUB_GRAPHQL: 'api.github.com',
      GITHUB_RAW: 'raw.githubusercontent.com',
      GITHUB_TOKEN: '123',
      GIT_PASSWORD: '123',
      GIT_URL: 'github.com',
      GIT_USERNAME: 'x-access-token',
      id: '1',
      identifier: 'dummyBrokerIdentifier',
      type: 'github',
    });
    delete process.env.UNIVERSAL_BROKER_ENABLED;
    delete process.env.SERVICE_ENV;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITLAB_TOKEN;
    delete process.env.BROKER_TOKEN_1;
    delete process.env.BROKER_TOKEN_2;
    delete process.env.BROKER_TOKEN_3;
    delete process.env.CLIENT_ID;
    delete process.env.CLIENT_SECRET;
  });

  it('getConfigByidentifier with global BROKER_CLIENT_URL', async () => {
    process.env.UNIVERSAL_BROKER_ENABLED = 'true';
    process.env.BROKER_CLIENT_URL = 'dummy';
    process.env.SERVICE_ENV = 'universaltest';
    process.env.GITHUB_TOKEN = '123';
    process.env.GITLAB_TOKEN = '123';
    process.env.BROKER_TOKEN_1 = 'dummyBrokerIdentifier';
    process.env.BROKER_TOKEN_2 = 'dummyBrokerIdentifier2';
    process.env.BROKER_TOKEN_3 = 'dummyBrokerIdentifier3';
    process.env.CLIENT_ID = 'clienid';
    process.env.CLIENT_SECRET = 'clientsecret';
    await loadBrokerConfig();
    const configData = getConfigForIdentifier(
      'dummyBrokerIdentifier',
      getConfig(),
    );
    expect(configData).toEqual({
      BROKER_CLIENT_URL: 'dummy',
      BROKER_CLIENT_VALIDATION_AUTHORIZATION_HEADER: 'token 123',
      BROKER_CLIENT_VALIDATION_URL: 'https://api.github.com/user',
      BROKER_SERVER_URL: 'https://broker.dev.snyk.io',
      BROKER_HA_MODE_ENABLED: 'false',
      BROKER_DISPATCHER_BASE_URL: 'https://api.dev.snyk.io',
      BROKER_HEALTHCHECK_PATH: '/healthcheck',
      GITHUB: 'github.com',
      GITHUB_API: 'api.github.com',
      GITHUB_GRAPHQL: 'api.github.com',
      GITHUB_RAW: 'raw.githubusercontent.com',
      GITHUB_TOKEN: '123',
      GIT_PASSWORD: '123',
      GIT_URL: 'github.com',
      GIT_USERNAME: 'x-access-token',
      id: '1',
      identifier: 'dummyBrokerIdentifier',
      type: 'github',
    });
    delete process.env.UNIVERSAL_BROKER_ENABLED;
    delete process.env.BROKER_CLIENT_URL;
    delete process.env.SERVICE_ENV;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITLAB_TOKEN;
    delete process.env.BROKER_TOKEN_1;
    delete process.env.BROKER_TOKEN_2;
    delete process.env.BROKER_TOKEN_3;
    delete process.env.CLIENT_ID;
    delete process.env.CLIENT_SECRET;
  });

  it('fails to load if missing env var', async () => {
    process.env.UNIVERSAL_BROKER_ENABLED = 'true';
    process.env.SERVICE_ENV = 'universaltest';
    try {
      await loadBrokerConfig();
      expect(false).toBeTruthy();
    } catch (err: any) {
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toContain('Missing env var');
    }
  });

  it('getConfigByidentifier with null Context', async () => {
    process.env.UNIVERSAL_BROKER_ENABLED = 'true';
    process.env.SERVICE_ENV = 'universaltest';
    process.env.GITHUB_TOKEN = '123';
    process.env.GITLAB_TOKEN = '123';
    process.env.BROKER_TOKEN_1 = 'dummyBrokerIdentifier';
    process.env.BROKER_TOKEN_2 = 'dummyBrokerIdentifier2';
    process.env.BROKER_TOKEN_3 = 'dummyBrokerIdentifier3';
    process.env.BROKER_TOKEN_4 = 'brokertoken4';
    process.env.JIRA_PAT = 'jirapat';
    process.env.JIRA_HOSTNAME = 'hostname';
    process.env.CLIENT_ID = 'clienid';
    process.env.CLIENT_SECRET = 'clientsecret';
    await loadBrokerConfig();
    const configData = getConfigForIdentifier(
      'dummyBrokerIdentifier',
      getConfig(),
      null,
    );
    expect(configData).toEqual({
      BROKER_CLIENT_VALIDATION_AUTHORIZATION_HEADER: 'token 123',
      BROKER_CLIENT_VALIDATION_URL: 'https://api.github.com/user',
      BROKER_SERVER_URL: 'https://broker.dev.snyk.io',
      BROKER_HA_MODE_ENABLED: 'false',
      BROKER_DISPATCHER_BASE_URL: 'https://api.dev.snyk.io',
      BROKER_HEALTHCHECK_PATH: '/healthcheck',
      GITHUB: 'github.com',
      GITHUB_API: 'api.github.com',
      GITHUB_GRAPHQL: 'api.github.com',
      GITHUB_RAW: 'raw.githubusercontent.com',
      GITHUB_TOKEN: '123',
      GIT_PASSWORD: '123',
      GIT_URL: 'github.com',
      GIT_USERNAME: 'x-access-token',
      id: '1',
      identifier: 'dummyBrokerIdentifier',
      type: 'github',
    });
    delete process.env.UNIVERSAL_BROKER_ENABLED;
    delete process.env.SERVICE_ENV;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITLAB_TOKEN;
    delete process.env.BROKER_TOKEN_1;
    delete process.env.BROKER_TOKEN_2;
    delete process.env.BROKER_TOKEN_3;
    delete process.env.CLIENT_ID;
    delete process.env.CLIENT_SECRET;
  });

  it('getConfigByidentifier with Context', async () => {
    process.env.UNIVERSAL_BROKER_ENABLED = 'true';
    process.env.SERVICE_ENV = 'universaltest9';
    process.env.GITHUB_TOKEN = '123';
    process.env.GITHUB_TOKEN2 = '456';
    process.env.GITLAB_TOKEN = '123';
    process.env.BROKER_TOKEN_1 = 'dummyBrokerIdentifier';
    process.env.BROKER_TOKEN_2 = 'dummyBrokerIdentifier2';
    process.env.BROKER_TOKEN_3 = 'dummyBrokerIdentifier3';
    process.env.BROKER_TOKEN_4 = 'brokertoken4';
    process.env.JIRA_PAT = 'jirapat';
    process.env.JIRA_HOSTNAME = 'hostname';
    process.env.CLIENT_ID = 'clienid';
    process.env.CLIENT_SECRET = 'clientsecret';
    await loadBrokerConfig();
    const configData = getConfigForIdentifier(
      'dummyBrokerIdentifier',
      getConfig(),
      'test-context',
    );
    expect(configData).toEqual({
      BROKER_CLIENT_VALIDATION_AUTHORIZATION_HEADER: 'token 456',
      BROKER_CLIENT_VALIDATION_URL: 'https://api.github.com/user',
      BROKER_SERVER_URL: 'https://broker.dev.snyk.io',
      BROKER_HA_MODE_ENABLED: 'false',
      BROKER_DISPATCHER_BASE_URL: 'https://api.dev.snyk.io',
      BROKER_HEALTHCHECK_PATH: '/healthcheck',
      GITHUB: 'github.com',
      GITHUB_API: 'api.github.com',
      GITHUB_GRAPHQL: 'api.github.com',
      GITHUB_RAW: 'raw.githubusercontent.com',
      GITHUB_TOKEN: '456',
      GIT_PASSWORD: '456',
      GIT_URL: 'github.com',
      GIT_USERNAME: 'x-access-token',
      id: '1',
      identifier: 'dummyBrokerIdentifier',
      type: 'github',
    });
    delete process.env.UNIVERSAL_BROKER_ENABLED;
    delete process.env.SERVICE_ENV;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN2;
    delete process.env.GITLAB_TOKEN;
    delete process.env.BROKER_TOKEN_1;
    delete process.env.BROKER_TOKEN_2;
    delete process.env.BROKER_TOKEN_3;
    delete process.env.CLIENT_ID;
    delete process.env.CLIENT_SECRET;
  });

  it('getConfigByidentifier with Context that uses alternate filter type', async () => {
    process.env.UNIVERSAL_BROKER_ENABLED = 'true';
    process.env.SERVICE_ENV = 'universaltest12';
    process.env.BROKER_TOKEN_1 = 'dummyBrokerIdentifier';
    process.env.BITBUCKET = 'bitbucket.server';
    process.env.BITBUCKET_PAT = 'bitbucketpat';
    process.env.CLIENT_ID = 'clienid';
    process.env.CLIENT_SECRET = 'clientsecret';
    await loadBrokerConfig();
    const configData = getConfigForIdentifier(
      'dummyBrokerIdentifier',
      getConfig(),
      'test-context',
    );
    expect(configData).toEqual({
      BROKER_CLIENT_VALIDATION_AUTHORIZATION_HEADER: 'Bearer bitbucketpat',
      BROKER_CLIENT_VALIDATION_URL:
        'https://bitbucket.server/rest/api/1.0/projects',
      BROKER_SERVER_URL: 'https://broker.dev.snyk.io',
      BROKER_HA_MODE_ENABLED: 'false',
      BROKER_DISPATCHER_BASE_URL: 'https://api.dev.snyk.io',
      BROKER_HEALTHCHECK_PATH: '/healthcheck',
      BITBUCKET: 'bitbucket.server',
      BITBUCKET_GIT: 'bitbucket.server',
      BITBUCKET_API: 'bitbucket.server/rest/api/1.0',
      BITBUCKET_PAT: 'bitbucketpat',
      GIT_PASSWORD: 'bitbucketpat',
      GIT_URL: 'bitbucket.server',
      GIT_USERNAME: 'x-access-token',
      id: '1',
      identifier: 'dummyBrokerIdentifier',
      type: 'bitbucket-server-bearer-auth',
    });
    delete process.env.UNIVERSAL_BROKER_ENABLED;
    delete process.env.SERVICE_ENV;
    delete process.env.BROKER_TOKEN_1;
    delete process.env.BITBUCKET;
    delete process.env.BITBUCKET_PAT;
    delete process.env.CLIENT_ID;
    delete process.env.CLIENT_SECRET;
  });

  it('getConfigByidentifier with non existing Context should throw', async () => {
    process.env.UNIVERSAL_BROKER_ENABLED = 'true';
    process.env.SERVICE_ENV = 'universaltest10';
    process.env.GITHUB_TOKEN = '123';
    process.env.GITLAB_TOKEN = '123';
    process.env.BROKER_TOKEN_1 = 'dummyBrokerIdentifier';
    process.env.BROKER_TOKEN_2 = 'dummyBrokerIdentifier2';
    process.env.BROKER_TOKEN_3 = 'dummyBrokerIdentifier3';
    process.env.BROKER_TOKEN_4 = 'brokertoken4';
    process.env.JIRA_PAT = 'jirapat';
    process.env.JIRA_HOSTNAME = 'hostname';
    process.env.CLIENT_ID = 'clienid';
    process.env.CLIENT_SECRET = 'clientsecret';
    await loadBrokerConfig();
    expect(() =>
      getConfigForIdentifier(
        'dummyBrokerIdentifier',
        getConfig(),
        'test-context',
      ),
    ).toThrowError(
      'Interrupting request. Unable to find context test-context for my github connection. Please review config.',
    );
  });

  it('getConfigByidentifier with Context discard unauthorized env vars', async () => {
    process.env.UNIVERSAL_BROKER_ENABLED = 'true';
    process.env.SERVICE_ENV = 'universaltest11';
    process.env.GITHUB_TOKEN = '123';
    process.env.GITHUB_TOKEN2 = '456';
    process.env.GITLAB_TOKEN = '123';
    process.env.BROKER_TOKEN_1 = 'dummyBrokerIdentifier';
    process.env.BROKER_TOKEN_2 = 'dummyBrokerIdentifier2';
    process.env.BROKER_TOKEN_3 = 'dummyBrokerIdentifier3';
    process.env.BROKER_TOKEN_4 = 'brokertoken4';
    process.env.JIRA_PAT = 'jirapat';
    process.env.JIRA_HOSTNAME = 'hostname';
    process.env.CLIENT_ID = 'clienid';
    process.env.CLIENT_SECRET = 'clientsecret';
    await loadBrokerConfig();
    const configData = getConfigForIdentifier(
      'dummyBrokerIdentifier',
      getConfig(),
      'test-context',
    );
    expect(configData['UNAUTHORIZED']).toBeUndefined();
    expect(configData['GITHUB_TOKEN']).toEqual(process.env.GITHUB_TOKEN2);

    delete process.env.UNIVERSAL_BROKER_ENABLED;
    delete process.env.SERVICE_ENV;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN2;
    delete process.env.GITLAB_TOKEN;
    delete process.env.BROKER_TOKEN_1;
    delete process.env.BROKER_TOKEN_2;
    delete process.env.BROKER_TOKEN_3;
    delete process.env.CLIENT_ID;
    delete process.env.CLIENT_SECRET;
  });
});
