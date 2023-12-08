process.env.FOO = 'bar';
process.env.BROKER_TOKEN = '1234';
process.env.BITBUCKET_PASSWORD_POOL = '1234, 5678';
process.env.GITHUB_TOKEN_POOL = '9012, 3456';
process.env.FOO_BAR = '$FOO/bar';
process.env.GITHUB_USERNAME = 'git';
process.env.GITHUB_PASSWORD_POOL = '9012, 3456';
process.env.GITHUB_AUTH = 'Basic $GITHUB_USERNAME:$GITHUB_PASSWORD';
process.env.COMPLEX_TOKEN = '1234$$%#@!$!$@$$$';

import { getConfig, loadBrokerConfig } from '../../lib/common/config/config';
import {
  getConfigForType,
  getConfigForIdentifier,
} from '../../lib/common/config/universal';
describe('config', () => {
  it('contain application config', () => {
    const foo = process.env.FOO;
    const token = process.env.BROKER_TOKEN;
    const bitbucketTokens = ['1234', '5678'];
    const githubTokens = ['9012', '3456'];
    const complexToken = process.env.COMPLEX_TOKEN;
    loadBrokerConfig();
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

  it('getConfigType', () => {
    loadBrokerConfig();
    const configData = getConfigForType('github');

    expect(configData).toEqual({
      BROKER_CLIENT_VALIDATION_AUTHORIZATION_HEADER: 'token $GITHUB_TOKEN',
      BROKER_CLIENT_VALIDATION_URL: 'https://$GITHUB_API/user',
      BROKER_HEALTHCHECK_PATH: '/healthcheck',
      BROKER_SERVER_URL: 'https://broker2.snyk.io',
      GITHUB: 'github.com',
      GITHUB_API: 'api.github.com',
      GITHUB_GRAPHQL: 'api.github.com',
      GITHUB_RAW: 'raw.githubusercontent.com',
      GIT_PASSWORD: '$GITHUB_TOKEN',
      GIT_URL: '$GITHUB',
      GIT_USERNAME: 'x-access-token',
    });
  });

  it('getConfigByidentifier', () => {
    process.env.UNIVERSAL_BROKER_ENABLED = 'true';
    process.env.SERVICE_ENV = 'universaltest';
    process.env.GITHUB_TOKEN = '123';
    process.env.GITLAB_TOKEN = '123';
    process.env.BROKER_TOKEN_1 = 'dummyBrokerIdentifier';
    process.env.BROKER_TOKEN_2 = 'dummyBrokerIdentifier2';
    loadBrokerConfig();
    const configData = getConfigForIdentifier(
      'dummyBrokerIdentifier',
      getConfig(),
    );
    expect(configData).toEqual({
      BROKER_CLIENT_VALIDATION_AUTHORIZATION_HEADER: 'token $GITHUB_TOKEN',
      BROKER_CLIENT_VALIDATION_URL: 'https://$GITHUB_API/user',
      BROKER_SERVER_URL: 'https://broker2.dev.snyk.io',
      BROKER_HA_MODE_ENABLED: 'false',
      BROKER_DISPATCHER_BASE_URL: 'https://api.dev.snyk.io',
      BROKER_HEALTHCHECK_PATH: '/healthcheck',
      GITHUB: 'github.com',
      GITHUB_API: 'api.github.com',
      GITHUB_GRAPHQL: 'api.github.com',
      GITHUB_RAW: 'raw.githubusercontent.com',
      GITHUB_TOKEN: '123',
      GIT_PASSWORD: '$GITHUB_TOKEN',
      GIT_URL: '$GITHUB',
      GIT_USERNAME: 'x-access-token',
      identifier: 'dummyBrokerIdentifier',
      type: 'github',
    });
    delete process.env.UNIVERSAL_BROKER_ENABLED;
    delete process.env.SERVICE_ENV;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITLAB_TOKEN;
    delete process.env.BROKER_TOKEN_1;
    delete process.env.BROKER_TOKEN_2;
  });

  it('getConfigByidentifier with global BROKER_CLIENT_URL', () => {
    process.env.UNIVERSAL_BROKER_ENABLED = 'true';
    process.env.BROKER_CLIENT_URL = 'dummy';
    process.env.SERVICE_ENV = 'universaltest';
    process.env.GITHUB_TOKEN = '123';
    process.env.GITLAB_TOKEN = '123';
    process.env.BROKER_TOKEN_1 = 'dummyBrokerIdentifier';
    process.env.BROKER_TOKEN_2 = 'dummyBrokerIdentifier2';
    loadBrokerConfig();
    const configData = getConfigForIdentifier(
      'dummyBrokerIdentifier',
      getConfig(),
    );
    expect(configData).toEqual({
      BROKER_CLIENT_URL: 'dummy',
      BROKER_CLIENT_VALIDATION_AUTHORIZATION_HEADER: 'token $GITHUB_TOKEN',
      BROKER_CLIENT_VALIDATION_URL: 'https://$GITHUB_API/user',
      BROKER_SERVER_URL: 'https://broker2.dev.snyk.io',
      BROKER_HA_MODE_ENABLED: 'false',
      BROKER_DISPATCHER_BASE_URL: 'https://api.dev.snyk.io',
      BROKER_HEALTHCHECK_PATH: '/healthcheck',
      GITHUB: 'github.com',
      GITHUB_API: 'api.github.com',
      GITHUB_GRAPHQL: 'api.github.com',
      GITHUB_RAW: 'raw.githubusercontent.com',
      GITHUB_TOKEN: '123',
      GIT_PASSWORD: '$GITHUB_TOKEN',
      GIT_URL: '$GITHUB',
      GIT_USERNAME: 'x-access-token',
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
  });

  it('fails to load if missing env var', () => {
    process.env.UNIVERSAL_BROKER_ENABLED = 'true';
    process.env.SERVICE_ENV = 'universaltest';
    try {
      loadBrokerConfig();
      expect(false).toBeTruthy();
    } catch (err: any) {
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toContain('Missing env var');
    }
  });
});
