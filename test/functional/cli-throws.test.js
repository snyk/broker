const test = require('tap-only');
const cli = require('../../cli/exec');

test('cli throws when missing broker id', t => {
  t.throws(() => {
    cli({
      _: ['client']
    });
  }, 'BROKER_ID');
  t.end();
});

test('cli throws when missing broker server', t => {
  process.env.BROKER_ID = 1;
  t.throws(() => {
    cli({
      _: ['client']
    });
  }, 'BROKER_SERVER_URL');
  t.end();
});
