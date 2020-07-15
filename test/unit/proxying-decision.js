const test = require('tap-only');
const u = require('url').parse;
const reload = require('require-reload')(require);

test('shouldProxy: no https proxy', (t) => {
  t.plan(1);
  // http, not httpS
  process.env.http_proxy = 'localhost:4444'; // eslint-disable-line

  // loaded now, for config to be reloaded after env vars
  reload('../../lib/config');
  const { shouldProxy } = reload('../../lib/patch-https-request-for-proxying');
  t.false(
    shouldProxy(u('https://broker.snyk.io')),
    'should not proxy when no https proxy is defined',
  );
});

test('shouldProxy: no_proxy', (t) => {
  t.plan(2);
  const oldestDomainOnINET = (process.env.no_proxy = 'symbolics.com'); // eslint-disable-line
  process.env.https_proxy = 'https://localhost:8888'; // eslint-disable-line

  // loaded now, for config to be reloaded after env vars
  reload('../../lib/config');
  const { shouldProxy } = reload('../../lib/patch-https-request-for-proxying');
  const url = u('http://' + oldestDomainOnINET);
  t.false(shouldProxy(url), 'should not proxy domains from no_proxy');
  t.true(shouldProxy(u('https://shambhala.org/')), 'not in no_proxy');
});

test('shouldProxy: NO_PROXY', (t) => {
  t.plan(2);
  const dontProx = 'wiki.c2.com';
  process.env.NO_PROXY = 'symbolics.com,' + dontProx;
  process.env.HTTPS_PROXY = 'https://localhost:8888';

  // loaded now, for config to be reloaded after env vars
  reload('../../lib/config');
  const { shouldProxy } = reload('../../lib/patch-https-request-for-proxying');
  t.false(
    shouldProxy(u('https://' + dontProx + '/?XeroxParc')),
    'should not proxy domains from NO_PROXY',
  );
  t.true(shouldProxy(u('http://silibank.net.kp')), 'not in NO_PROXY');
});
