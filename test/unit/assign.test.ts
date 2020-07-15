const test = require('tap-only');

test('assign', (t) => {
  const u = {
    id: 1234,
    url: 'prod',
  };

  const c = {
    url: 'default',
    test: true,
  };

  const r = Object.assign({}, c, u);
  t.deepEqual(r, {
    id: 1234,
    url: 'prod', // user based
    test: true,
  });

  t.end();
});
