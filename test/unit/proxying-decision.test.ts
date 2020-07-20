import { parse } from 'url';

describe('Proxy decision', () => {
  afterEach(() => {
    jest.resetModules();
  });

  it('should not proxy when no https proxy is defined', () => {
    // http, not httpS
    // eslint-disable-next-line @typescript-eslint/camelcase
    process.env.http_proxy = 'localhost:4444';
    // loaded now, for config to be reloaded after env vars
    const {
      shouldProxy,
    } = require('../../lib/patch-https-request-for-proxying');
    expect(shouldProxy(parse('https://broker.snyk.io'))).toEqual(false);
  });

  it('should not proxy URLs set via `no_proxy` env var', () => {
    // eslint-disable-next-line @typescript-eslint/camelcase
    const oldestDomainOnINET = (process.env.no_proxy = 'symbolics.com');
    // eslint-disable-next-line @typescript-eslint/camelcase
    process.env.https_proxy = 'https://localhost:8888';

    // loaded now, for config to be reloaded after env vars
    const {
      shouldProxy,
    } = require('../../lib/patch-https-request-for-proxying');
    const url = parse('http://' + oldestDomainOnINET);
    expect(shouldProxy(url)).toEqual(false);
    expect(shouldProxy(parse('https://shambhala.org/'))).toEqual(true);
  });

  it('should not proxy URLs set via `NO_PROXY` env var', () => {
    const dontProx = 'wiki.c2.com';
    process.env.NO_PROXY = 'symbolics.com,' + dontProx;
    process.env.HTTPS_PROXY = 'https://localhost:8888';

    const {
      shouldProxy,
    } = require('../../lib/patch-https-request-for-proxying');

    expect(shouldProxy(parse(`https://${dontProx}/?XeroxParc`))).toEqual(false);
    expect(shouldProxy(parse('http://silibank.net.kp'))).toEqual(true);
  });
});
