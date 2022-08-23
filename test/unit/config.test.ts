describe('config', () => {
  it('contain application config', () => {
    const foo = (process.env.FOO = 'bar');
    const token = (process.env.BROKER_TOKEN = '1234');
    const bitbucketTokens = ['1234', '5678'];
    const githubTokens = ['9012', '3456'];
    process.env.BITBUCKET_PASSWORD_ARRAY = '1234, 5678'
    process.env.GITHUB_TOKEN_ARRAY = '9012, 3456'
    process.env.FOO_BAR = '$FOO/bar';
    process.env.GITHUB_USERNAME = 'git'
    process.env.GITHUB_PASSWORD_ARRAY = '9012, 3456'
    process.env.GITHUB_AUTH = 'Basic $GITHUB_USERNAME:$GITHUB_PASSWORD';
    const complexToken = (process.env.COMPLEX_TOKEN = '1234$$%#@!$!$@$$$');

    const config = require('../../lib/config');

    expect(config.foo).toEqual(foo);
    expect(config.brokerToken).toEqual(token);
    expect(config.fooBar).toEqual('bar/bar');
    expect(config.complexToken).toEqual(complexToken);
    expect(config.bitbucketPasswordArray).toEqual(bitbucketTokens);
    expect(config.BITBUCKET_PASSWORD_ARRAY).toEqual(bitbucketTokens);
    expect(config.githubTokenArray).toEqual(githubTokens);
    expect(config.GITHUB_TOKEN_ARRAY).toEqual(githubTokens);
    expect(config.githubAuthArray).toEqual(['Basic git:9012', 'Basic git:3456']);
    expect(config.GITHUB_AUTH_ARRAY).toEqual(['Basic git:9012', 'Basic git:3456']);
  });
});
