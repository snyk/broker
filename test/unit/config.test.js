const tap = require('tap').test;

tap('config', t => {
  const foo = process.env.FOO = 'bar';
  const id = process.env.BROKER_ID = '1234';

  const config = require('../../lib/config')();

  t.equal(config.foo, foo, 'foo');
  t.equal(config.brokerId, id, 'BROKER_ID');
  t.end();
});
