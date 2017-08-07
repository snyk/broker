const tap = require('tap');
const test = require('tap-only');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
let spy = null;

tap.beforeEach(done => {
  spy = sinon.spy();
  done();
});

test('relay swaps header values found in BROKER_VAR_SUB', t => {
  const brokerToken = 'test-broker';

  const config = {
    SECRET_TOKEN: 'very-secret',
    VALUE: 'some-special-value',
  };

  const relay = proxyquire('../../lib/relay', {
    request: (options, fn) => {
      spy(options);
      fn(null, { statusCode: 200 }, true);
    },
  }).response;

  const route = relay([{
    method: 'any',
    url: '/*',
  }], config)(brokerToken);

  const headers = {
    'x-broker-var-sub': 'private-token,replaceme',
    donttouch: 'not to be changed ${VALUE}',
    'private-token': 'Bearer ${SECRET_TOKEN}',
    replaceme: 'replace ${VALUE}',
  };

  route({
    url: '/',
    method: 'GET',
    headers: headers,
  }, () => {
    t.equal(spy.callCount, 1, 'request placed');
    const arg = spy.args[0][0];
    t.equal(arg.headers['private-token'], `Bearer ${config.SECRET_TOKEN}`);
    t.equal(arg.headers.replaceme, `replace ${config.VALUE}`);
    t.equal(arg.headers.donttouch, 'not to be changed ${VALUE}');
    t.end();
  });

});
