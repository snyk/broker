import {
  getClientConfigMetadata,
  reloadConfig,
} from '../../lib/client/config/configHelpers';
import { getConfig, loadBrokerConfig } from '../../lib/common/config/config';
import { LoadedClientOpts } from '../../lib/common/types/options';

describe('config', () => {
  beforeAll(async () => {
    await loadBrokerConfig();
  });
  afterEach(() => {
    delete process.env.LOG_LEVEL;
    delete process.env.LOG_ENABLE_BODY;
    delete process.env.GITHUB_TOKEN_POOL;
    delete process.env.INSECURE_DOWNSTREAM;
    delete process.env.BROKER_HA_MODE_ENABLED;
    delete process.env.HTTP_PROXY;
    delete process.env.NODE_EXTRA_CA_CERT;
    delete process.env.ACCEPT;
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    delete process.env.UNIVERSAL_BROKER_ENABLED;
  });

  afterAll(() => {
    delete process.env.LOG_LEVEL;
    delete process.env.LOG_ENABLE_BODY;
    delete process.env.GITHUB_TOKEN_POOL;
    delete process.env.INSECURE_DOWNSTREAM;
    delete process.env.BROKER_HA_MODE_ENABLED;
    delete process.env.HTTP_PROXY;
    delete process.env.NODE_EXTRA_CA_CERT;
    delete process.env.ACCEPT;
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    delete process.env.UNIVERSAL_BROKER_ENABLED;
  });
  it('everything is false for empty config', async () => {
    await loadBrokerConfig();
    const config = getConfig();
    expect(getClientConfigMetadata(config as LoadedClientOpts)).toEqual({
      bodyLogMode: false,
      credPooling: false,
      customAccept: false,
      debugMode: false,
      haMode: false,
      privateCa: false,
      proxy: false,
      tlsReject: false,
      insecureDownstream: false,
      universalBroker: false,
    });
  });

  it('everything is true for everything enabled in config', async () => {
    process.env.LOG_LEVEL = 'debug';
    process.env.LOG_ENABLE_BODY = 'true';
    process.env.GITHUB_TOKEN_POOL = '123,456';
    process.env.INSECURE_DOWNSTREAM = 'true_but_truly_value_does_not_matter';
    process.env.BROKER_HA_MODE_ENABLED = 'true';
    process.env.HTTP_PROXY = 'http://myproxy';
    process.env.NODE_EXTRA_CA_CERT = 'my/path';
    process.env.ACCEPT = 'my/path';
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    process.env.UNIVERSAL_BROKER_ENABLED = 'true';
    await loadBrokerConfig();
    const config = getConfig();
    expect(getClientConfigMetadata(config as LoadedClientOpts)).toEqual({
      bodyLogMode: true,
      credPooling: true,
      customAccept: true,
      debugMode: true,
      haMode: true,
      privateCa: true,
      proxy: true,
      tlsReject: true,
      insecureDownstream: true,
      universalBroker: true,
    });
  });

  it('everything is false for everything disabled in config', async () => {
    process.env.LOG_LEVEL = 'info';
    process.env.GITHUB_TOKEN = '456';
    process.env.BROKER_HA_MODE_ENABLED = 'false';
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
    await loadBrokerConfig();
    const config = getConfig();
    expect(getClientConfigMetadata(config as LoadedClientOpts)).toEqual({
      bodyLogMode: false,
      credPooling: false,
      customAccept: false,
      debugMode: false,
      haMode: false,
      privateCa: false,
      proxy: false,
      tlsReject: false,
      insecureDownstream: false,
      universalBroker: false,
    });
  });

  it('reloadConfig reloads config', async () => {
    let config = getConfig();
    expect(config['TEST']).toBeUndefined();
    process.env.TEST = 'value';
    await reloadConfig(config);
    config = getConfig();
    expect(config['TEST']).toEqual('value');
  });
});
