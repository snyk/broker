describe('config custom timeout', () => {
  it('contain custom timeout', () => {
    process.env.BROKER_DOWNSTREAM_TIMEOUT = '120000';
    const config2 = require('../../lib/config');
    expect(config2.BROKER_DOWNSTREAM_TIMEOUT).toEqual('120000');
    delete process.env.BROKER_DOWNSTREAM_TIMEOUT;
  });
});
