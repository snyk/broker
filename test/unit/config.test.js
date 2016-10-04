const test = require('tap-only');

test('config', t => {
  const foo = process.env.FOO = 'bar';
  const token = process.env.BROKER_TOKEN = '1234';

  const config = require('../../lib/config');

  t.equal(config.foo, foo, 'foo');
  t.equal(config.brokerToken, token, 'BROKER_TOKEN');
  t.end();
});

test('expandValue', t => {
  process.env.FOO = 'bar';
  const { expandValue } = require('../../lib/config/utils');
  t.equal(expandValue({}, '$FOO'), 'bar');
  t.end();
});

test('config expansion', t => {
  process.env.FOO = 'bar';
  const { expand } = require('../../lib/config/utils');

  const source = {
    bar: '$FOO',
    CAR: '1/$FOO/2',
    dar: '1/$CAR/2/$FOO',
  };


  const res = expand(source);
  t.equal(res.bar, 'bar');
  t.equal(res.CAR, '1/bar/2');
  t.equal(res.dar, '1/1/bar/2/2/bar');
  t.end();
});
