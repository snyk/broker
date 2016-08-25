const tap = require('tap');
const test = require('tap-only');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
let spy = null;

tap.beforeEach(done => {
  spy = sinon.spy();
  done();
});

test('relay swaps values found in BROKER_VAR_SUB', t => {
  process.env.HOST = 'localhost';
  process.env.PORT = '8001';

  const relay = proxyquire('../../lib/relay', {
    'request': (options, fn) => {
      spy(options);
      fn(null, { statusCode: 200 }, true);
    }
  }).response;

  const route = relay([{
    method: 'any',
    url: '/*'
  }]);

  route({
    url: '/',
    method: 'POST',
    body: {
      BROKER_VAR_SUB: ['url'],
      url: '${HOST}:${PORT}/webhook'
    },
    headers: {},
  }, () => {
    t.equal(spy.callCount, 1, 'request placed');
    const arg = spy.args[0][0];
    t.equal(arg.body.url, `${process.env.HOST}:${process.env.PORT}/webhook`);
    t.end();
  });

});
