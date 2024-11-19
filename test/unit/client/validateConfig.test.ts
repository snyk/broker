import { validateMinimalConfig } from '../../../lib/client/hooks/startup/processHooks';
import { ClientOpts } from '../../../lib/common/types/options';

describe('Client Config validations', () => {
  it('validateMinimalConfig standard', async () => {
    const clientOpts: ClientOpts = {
      port: 0,
      config: {
        brokerToken: '123',
        brokerServerUrl: 'test',
        supportedBrokerTypes: [],
        filterRulesPaths: {},
        brokerType: 'client',
      },
      filters: { public: [], private: [] },
    };

    await expect(validateMinimalConfig(clientOpts)).resolves;
  });

  it('validateMinimalConfig universal', async () => {
    const clientOpts: ClientOpts = {
      port: 0,
      config: {
        brokerToken: '123',
        brokerServerUrl: 'test',
        clientId: '123',
        clientSecret: '123',
        supportedBrokerTypes: [],
        filterRulesPaths: {},
        brokerType: 'client',
      },
      filters: { public: [], private: [] },
    };

    await expect(validateMinimalConfig(clientOpts)).resolves.not.toThrow(
      ReferenceError,
    );
  });

  it('validateMinimalConfig fail if universal without clientid or client secret', async () => {
    const clientOpts: ClientOpts = {
      port: 0,
      config: {
        brokerToken: '123',
        brokerServerUrl: 'test',
        universalBrokerEnabled: true,
        supportedBrokerTypes: [],
        filterRulesPaths: {},
        brokerType: 'client',
      },
      filters: { public: [], private: [] },
    };

    await expect(validateMinimalConfig(clientOpts)).rejects.toThrow(
      ReferenceError,
    );
  });

  it('validateMinimalConfig passes if universal SKIP_REMOTE_CONFIG true without clientid or client secret', async () => {
    const clientOpts: ClientOpts = {
      port: 0,
      config: {
        brokerToken: '123',
        brokerServerUrl: 'test',
        universalBrokerEnabled: true,
        SKIP_REMOTE_CONFIG: true,
        supportedBrokerTypes: [],
        filterRulesPaths: {},
        brokerType: 'client',
      },
      filters: { public: [], private: [] },
    };

    await expect(validateMinimalConfig(clientOpts)).resolves.not.toThrow(
      ReferenceError,
    );
  });
});
