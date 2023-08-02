process.env.SNYK_BROKER_BOOT_MODE = 'universal';
process.env.SERVICE_ENV = 'universal';
process.env.SNYK_BROKER_TYPES = 'testtype';
process.env.SNYK_SOURCE_TYPES__testtype__publicId =
  '9a3e5d90-b782-468a-a042-9a2073736f00';

describe('config', () => {
  it('contain default config', () => {
    const config = require('../../lib/config');

    expect(config).not.toBeNull();
  });
});
