import { parse } from 'url';

describe('Proxy decision', () => {
  afterEach(() => {
    delete process.env.no_proxy;
    delete process.env.NO_PROXY;
    delete process.env.https_proxy;
    delete process.env.HTTPS_PROXY;
    jest.resetModules();
  });

  it('should not proxy when no https proxy is defined', () => {
    // http, not httpS
    process.env.http_proxy = 'localhost:4444';
    // loaded now, for config to be reloaded after env vars
    const {
      shouldProxy,
    } = require('../../lib/common/http/patch-https-request-for-proxying');
    expect(shouldProxy(parse('https://broker.snyk.io'))).toEqual(false);
  });

  it('should not proxy URL set via `no_proxy` env var', () => {
    process.env.no_proxy = 'symbolics.com';
    process.env.https_proxy = 'https://localhost:8888';

    // loaded now, for config to be reloaded after env vars
    const {
      shouldProxy,
    } = require('../../lib/common/http/patch-https-request-for-proxying');
    const url = parse('http://symbolics.com');
    expect(shouldProxy(url)).toEqual(false);
    expect(shouldProxy(parse('https://shambhala.org/'))).toEqual(true);
  });

  it('should not proxy URL set via `NO_PROXY` env var', () => {
    process.env.NO_PROXY = 'symbolics.com';
    process.env.https_proxy = 'https://localhost:8888';

    // loaded now, for config to be reloaded after env vars
    const {
      shouldProxy,
    } = require('../../lib/common/http/patch-https-request-for-proxying');
    const url = parse('http://symbolics.com');
    expect(shouldProxy(url)).toEqual(false);
    expect(shouldProxy(parse('https://shambhala.org/'))).toEqual(true);
  });

  it('should not proxy URL set via `NO_PROXY` env var when containing query params', () => {
    process.env.NO_PROXY = 'symbolics.com';
    process.env.https_proxy = 'https://localhost:8888';

    // loaded now, for config to be reloaded after env vars
    const {
      shouldProxy,
    } = require('../../lib/common/http/patch-https-request-for-proxying');

    expect(shouldProxy(parse('http://symbolics.com/?hello'))).toEqual(false);
  });

  it('should not proxy list of URLs set via `NO_PROXY` env var', () => {
    process.env.NO_PROXY = 'symbolics.com,wiki.c2.com';
    process.env.HTTPS_PROXY = 'https://localhost:8888';

    const {
      shouldProxy,
    } = require('../../lib/common/http/patch-https-request-for-proxying');

    expect(shouldProxy(parse(`https://wiki.c2.com`))).toEqual(false);
    expect(shouldProxy(parse(`https://symbolics.com`))).toEqual(false);
    expect(shouldProxy(parse('https://silibank.net.kp'))).toEqual(true);
  });
});
