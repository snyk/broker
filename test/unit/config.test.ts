describe('config', () => {
  it('parses application config', () => {
    const foo = (process.env.FOO = 'bar');
    const token = (process.env.BROKER_TOKEN = '1234');
    const passwordWithSpecialChars = (process.env.BITBUCKET_PASSWORD =
      "!\"#%&'()*+,-./:;$<=>?@[\\]^_`{|}~'");
    const brokerClientValidationAuthHeader =
      (process.env.BROKER_CLIENT_VALIDATION_AUTHORIZATION_HEADER =
        "username:!\"#%&'()*+,-./:;$<=>?@[\\]^_`{|}~'");
    const brokerClientValidationBasicAuth =
      (process.env.BROKER_CLIENT_VALIDATION_BASIC_AUTH =
        "username:!\"#%&'()*+,-./:;$<=>?@[\\]^_`{|}~'");

    process.env.EXPANDABLE_ENV_VAR = '$FOO/bar';

    const config = require('../../lib/config');

    expect(config.foo).toEqual(foo);
    expect(config.brokerToken).toEqual(token);
    expect(config.expandableEnvVar).toEqual('bar/bar');
    expect(config.bitbucketPassword).toEqual(passwordWithSpecialChars);
    expect(config.brokerClientValidationAuthorizationHeader).toEqual(
      brokerClientValidationAuthHeader,
    );
    expect(config.brokerClientValidationBasicAuth).toEqual(
      brokerClientValidationBasicAuth,
    );
  });
});
