import { PostFilterPreparedRequest } from '../../../lib/broker-workload/prepareRequest';
import {
  loadPlugins,
  runPreRequestPlugins,
  runStartupPlugins,
} from '../../../lib/hybrid-sdk/client/brokerClientPlugins/pluginManager';
import {
  findProjectRoot,
  setConfig,
} from '../../../lib/hybrid-sdk/common/config/config';
import {
  getPluginConfigParamByConnectionKey,
  getPluginConfigParamByConnectionKeyAndContextId,
  getPluginsConfig,
} from '../../../lib/hybrid-sdk/common/config/pluginsConfig';

describe('Plugin Manager', () => {
  const pluginsFolderPath = `${findProjectRoot(
    __dirname,
  )}/test/fixtures/plugins`;

  it('should load plugins successfully', async () => {
    const clientOpts = {
      config: {
        universalBrokerEnabled: true,
        supportedBrokerTypes: ['dummy'],
        connections: { 'my connection': { type: 'dummy' } },
      },
    };
    const plugins = await loadPlugins(pluginsFolderPath, clientOpts);
    expect(plugins.get('dummy').length).toBeGreaterThanOrEqual(1);
    expect(plugins.get('dummy')[0].pluginName).toEqual('Dummy Plugin');
  });

  it('should load plugins if at least one supported broker type is present', async () => {
    const clientOpts = {
      config: {
        universalBrokerEnabled: true,
        supportedBrokerTypes: ['dummy-multi-1'],
        connections: { 'my connection': { type: 'dummy-multi-1' } },
      },
    };
    const plugins = await loadPlugins(pluginsFolderPath, clientOpts);
    expect(plugins.get('dummy-multi-1').length).toBeGreaterThanOrEqual(1);
    expect(plugins.get('dummy-multi-1')[0].pluginName).toEqual(
      'Dummy Plugin Multi',
    );
  });

  it('should load plugins no plugin successfully', async () => {
    const clientOpts = {
      config: {
        universalBrokerEnabled: true,
        supportedBrokerTypes: ['dummy4'],
        connections: { 'my connection': { type: 'dummy4' } },
      },
    };
    const plugins = await loadPlugins(pluginsFolderPath, clientOpts);
    expect(plugins.get('dummy4').length).toBeGreaterThanOrEqual(0);
  });
  it('should not load plugins if disabled', async () => {
    const clientOpts = {
      config: {
        universalBrokerEnabled: true,
        supportedBrokerTypes: ['dummy'],
        connections: { 'my connection': { type: 'dummy' } },
      },
    };
    clientOpts.config['DISABLE_DUMMY_PLUGIN'] = true;
    const plugins = await loadPlugins(pluginsFolderPath, clientOpts);
    expect(plugins.get('dummy').length).toBeLessThanOrEqual(0);
  });
  it('should not load plugins if disabled', async () => {
    const clientOpts = {
      config: {
        universalBrokerEnabled: true,
        supportedBrokerTypes: ['dummy'],
        connections: { 'my connection': { type: 'dummy' } },
      },
    };
    clientOpts.config['DISABLE_WHATEVER_PLUGIN'] = true;
    const plugins = await loadPlugins(pluginsFolderPath, clientOpts);
    expect(plugins.get('dummy').length).toBeGreaterThanOrEqual(1);
  });

  it('should run startup plugins successfully', async () => {
    const clientOpts = {
      config: {
        universalBrokerEnabled: true,
        supportedBrokerTypes: ['dummy'],
        connections: { 'my connection': { type: 'dummy' } },
      },
    };
    try {
      const plugins = await loadPlugins(pluginsFolderPath, clientOpts);
      expect(plugins.get('dummy').length).toBeGreaterThanOrEqual(1);
      expect(plugins.get('dummy')[0].pluginName).toEqual('Dummy Plugin');

      await runStartupPlugins(clientOpts, 'my connection');
      expect(
        getPluginConfigParamByConnectionKey(
          'my connection',
          'NEW_VAR_ADDED_TO_CONNECTION',
        ),
      ).toEqual('access-token');
    } catch (err) {
      // we should not error
      expect(err).toBeNull();
    }
  });

  it('should run startup plugins with context successfully', async () => {
    const clientOpts = {
      config: {
        universalBrokerEnabled: true,
        supportedBrokerTypes: ['dummy-context'],
        connections: {
          'my connection': {
            type: 'dummy-context',
            contexts: {
              'test-context': {
                GITHUB_TOKEN: '${GITHUB_TOKEN}',
              },
              'test-context2': {
                GITHUB_TOKEN: '${GITHUB_TOKEN2}',
              },
            },
          },
        },
      },
    };
    try {
      const plugins = await loadPlugins(pluginsFolderPath, clientOpts);
      expect(plugins.get('dummy-context').length).toBeGreaterThanOrEqual(1);
      expect(plugins.get('dummy-context')[0].pluginName).toEqual(
        'Dummy Context Plugin',
      );

      await runStartupPlugins(clientOpts, 'my connection');
      expect(
        getPluginConfigParamByConnectionKey(
          'my connection',
          'NEW_VAR_ADDED_TO_CONNECTION',
        ),
      ).toEqual('access-token');
      // Connections contexts remain untouched
      expect(
        clientOpts.config.connections['my connection'].contexts['test-context'],
      ).toEqual({
        GITHUB_TOKEN: '${GITHUB_TOKEN}',
      });
      expect(
        clientOpts.config.connections['my connection'].contexts[
          'test-context2'
        ],
      ).toEqual({
        GITHUB_TOKEN: '${GITHUB_TOKEN2}',
      });
      // Connections contexts remain untouched
      expect(
        getPluginConfigParamByConnectionKeyAndContextId(
          'my connection',
          'test-context',
          'NEW_VAR_ADDED_TO_CONNECTION',
        ),
      ).toEqual('access-token-context');
      expect(
        getPluginConfigParamByConnectionKeyAndContextId(
          'my connection',
          'test-context2',
          'NEW_VAR_ADDED_TO_CONNECTION',
        ),
      ).toEqual('access-token-context');
    } catch (err) {
      // we should not error
      expect(err).toBeNull();
    }
  });

  it('should run prerequest plugins successfully', async () => {
    const clientOpts = {
      config: {
        universalBrokerEnabled: true,
        supportedBrokerTypes: ['dummy'],
        connections: { 'my connection': { type: 'dummy', identifier: '123' } },
        brokerClientConfiguration: {
          common: {},
        },
      },
    };
    // Simulating client config
    setConfig(clientOpts.config);
    try {
      const plugins = await loadPlugins(pluginsFolderPath, clientOpts);
      expect(plugins.get('dummy').length).toBeGreaterThanOrEqual(1);
      expect(plugins.get('dummy')[0].pluginName).toEqual('Dummy Plugin');

      await runStartupPlugins(clientOpts, 'my connection');
      expect(
        getPluginConfigParamByConnectionKey(
          'my connection',
          'NEW_VAR_ADDED_TO_CONNECTION',
        ),
      ).toEqual('access-token');
      const requestDetails: PostFilterPreparedRequest = {
        url: 'http://bla',
        headers: { myHeader: 'my_value' },
        method: 'POST',
        body: { myField: 'my field value' },
      };
      const requestBodyDetailsOriginal = Object.assign({}, requestDetails.body);
      const expectedRequestBody = Object.assign({}, requestDetails.body);
      expectedRequestBody['NEW_VAR_ADDED_TO_CONNECTION'] = 'access-token';
      const request = await runPreRequestPlugins(
        clientOpts,
        clientOpts.config.connections['my connection'].identifier,
        requestDetails,
        null,
      );
      expect(request.body).not.toEqual(requestBodyDetailsOriginal);
      expect(request.body).toEqual(expectedRequestBody);
    } catch (err) {
      // we should not error
      expect(err).toBeNull();
    }
    delete clientOpts.config.connections['my connection'][
      'NEW_VAR_ADDED_TO_CONNECTION'
    ];
  });

  it('should run prerequest plugins with context successfully', async () => {
    const clientOpts = {
      config: {
        universalBrokerEnabled: true,
        supportedBrokerTypes: ['dummy-context'],
        connections: {
          'my connection': {
            identifier: '123',
            type: 'dummy-context',
            contexts: {
              'test-context': {
                GITHUB_TOKEN: '${GITHUB_TOKEN}',
                NEW_VAR_ADDED_TO_CONNECTION: 'access-token-context',
              },
              'test-context2': {
                GITHUB_TOKEN: '${GITHUB_TOKEN2}',
              },
            },
          },
        },
        brokerClientConfiguration: {
          common: {},
          'dummy-context': {
            required: {
              NEW_VAR_ADDED_TO_CONNECTION:
                'dummy_placeholder_in_config_default_json_to_be_replaced_by_value_from_context',
            },
          },
        },
      },
    };
    // Simulating client config
    setConfig(clientOpts.config);
    try {
      const plugins = await loadPlugins(pluginsFolderPath, clientOpts);
      expect(plugins.get('dummy-context').length).toBeGreaterThanOrEqual(1);
      expect(plugins.get('dummy-context')[0].pluginName).toEqual(
        'Dummy Context Plugin',
      );

      await runStartupPlugins(clientOpts, 'my connection');
      expect(
        getPluginsConfig()['my connection']['NEW_VAR_ADDED_TO_CONNECTION'],
      ).toEqual('access-token');
      const requestDetails: PostFilterPreparedRequest = {
        url: 'http://bla',
        headers: { myHeader: 'my_value' },
        method: 'POST',
        body: { myField: 'my field value' },
      };
      const requestBodyDetailsOriginal = Object.assign({}, requestDetails.body);
      const expectedRequestBody = Object.assign({}, requestDetails.body);
      expectedRequestBody['NEW_VAR_ADDED_TO_CONNECTION'] =
        'access-token-context';
      const request = await runPreRequestPlugins(
        clientOpts,
        clientOpts.config.connections['my connection'].identifier,
        requestDetails,
        'test-context',
      );
      expect(request.body).not.toEqual(requestBodyDetailsOriginal);
      expect(request.body).toEqual(expectedRequestBody);
    } catch (err) {
      // we should not error
      expect(err).toBeNull();
    }
    delete clientOpts.config.connections['my connection'][
      'NEW_VAR_ADDED_TO_CONNECTION'
    ];
  });

  it('should run prerequest returning same request if not implemented', async () => {
    const clientOpts = {
      config: {
        universalBrokerEnabled: true,
        supportedBrokerTypes: ['dummy', 'dummy2'],
        connections: {
          'my connection 2': { type: 'dummy2', identifier: '456' },
        },
        brokerClientConfiguration: {
          common: {},
        },
      },
    };
    // Simulating client config
    setConfig(clientOpts.config);
    try {
      const plugins = await loadPlugins(pluginsFolderPath, clientOpts);
      expect(plugins.get('dummy2').length).toBeGreaterThanOrEqual(1);
      expect(plugins.get('dummy2')[0].pluginName).toEqual('Dummy Plugin 2');

      await runStartupPlugins(clientOpts, 'my connection 2');
      expect(
        getPluginConfigParamByConnectionKey(
          'my connection 2',
          'NEW_VAR_ADDED_TO_CONNECTION_2',
        ),
      ).toEqual('access-token');
      const requestDetails: PostFilterPreparedRequest = {
        url: 'http://bla',
        headers: { myHeader: 'my_value' },
        method: 'POST',
        body: { myField: 'my field value' },
      };
      const requestBodyDetailsOriginal = Object.assign({}, requestDetails.body);
      const request = await runPreRequestPlugins(
        clientOpts,
        clientOpts.config.connections['my connection 2'].identifier,
        requestDetails,
        null,
      );
      expect(request.body).toEqual(requestBodyDetailsOriginal);
    } catch (err) {
      // we should not error
      expect(err).toBeNull();
    }
  });

  it('Multiple connections keeping things in their own swim lane', async () => {
    const clientOpts = {
      config: {
        universalBrokerEnabled: true,
        supportedBrokerTypes: ['dummy', 'dummy2'],
        connections: {
          'my connection': { type: 'dummy', identifier: '123' },
          'my connection 2': { type: 'dummy2', identifier: '456' },
        },
        brokerClientConfiguration: {
          common: {},
        },
      },
    };
    // Simulating client config
    setConfig(clientOpts.config);
    try {
      const plugins = await loadPlugins(pluginsFolderPath, clientOpts);
      expect(plugins.get('dummy').length).toBeGreaterThanOrEqual(1);
      expect(plugins.get('dummy')[0].pluginName).toEqual('Dummy Plugin');
      expect(plugins.get('dummy2').length).toBeGreaterThanOrEqual(1);
      expect(plugins.get('dummy2')[0].pluginName).toEqual('Dummy Plugin 2');

      await runStartupPlugins(clientOpts, 'my connection');
      expect(
        getPluginConfigParamByConnectionKey(
          'my connection',
          'NEW_VAR_ADDED_TO_CONNECTION',
        ),
      ).toEqual('access-token');
      await runStartupPlugins(clientOpts, 'my connection 2');
      expect(
        getPluginConfigParamByConnectionKey(
          'my connection 2',
          'NEW_VAR_ADDED_TO_CONNECTION_2',
        ),
      ).toEqual('access-token');

      const requestDetails: PostFilterPreparedRequest = {
        url: 'http://bla',
        headers: { myHeader: 'my_value' },
        method: 'POST',
        body: { myField: 'my field value' },
      };
      const requestBodyDetailsOriginal = Object.assign({}, requestDetails.body);
      const expectedRequestBody = Object.assign({}, requestDetails.body);
      expectedRequestBody['NEW_VAR_ADDED_TO_CONNECTION'] = 'access-token';
      const request = await runPreRequestPlugins(
        clientOpts,
        clientOpts.config.connections['my connection'].identifier,
        requestDetails,
        null,
      );
      expect(request.body).not.toEqual(requestBodyDetailsOriginal);
      expect(request.body).toEqual(expectedRequestBody);

      const requestDetails2: PostFilterPreparedRequest = {
        url: 'http://bla',
        headers: { myHeader: 'my_value' },
        method: 'POST',
        body: { myField: 'my field value' },
      };
      const requestBodyDetailsOriginal2 = Object.assign(
        {},
        requestDetails2.body,
      );
      const request2 = await runPreRequestPlugins(
        clientOpts,
        clientOpts.config.connections['my connection 2'].identifier,
        requestDetails2,
        null,
      );
      expect(request2.body).toEqual(requestBodyDetailsOriginal2);
    } catch (err) {
      // we should not error
      expect(err).toBeNull();
    }
  });

  it('Multiple connections and multiple plugins for a given type keep things in their own swim lane', async () => {
    const clientOpts = {
      config: {
        universalBrokerEnabled: true,
        supportedBrokerTypes: ['dummy', 'dummy2', 'dummy3'],
        connections: {
          'my connection': { type: 'dummy', identifier: '123' },
          'my connection 2': { type: 'dummy2', identifier: '456' },
          'my connection 3': { type: 'dummy3', identifier: '789' },
        },
        brokerClientConfiguration: {
          common: {},
        },
      },
    };
    // Simulating client config
    setConfig(clientOpts.config);
    try {
      const plugins = await loadPlugins(pluginsFolderPath, clientOpts);
      expect(plugins.get('dummy').length).toBeGreaterThanOrEqual(1);
      expect(plugins.get('dummy')[0].pluginName).toEqual('Dummy Plugin');
      expect(plugins.get('dummy2').length).toBeGreaterThanOrEqual(1);
      expect(plugins.get('dummy2')[0].pluginName).toEqual('Dummy Plugin 2');
      expect(plugins.get('dummy3').length).toBeGreaterThanOrEqual(2);
      expect(plugins.get('dummy3')[0].pluginName).toEqual('Dummy 3 Plugin');
      expect(plugins.get('dummy3')[1].pluginName).toEqual(
        'Second Dummy 3 Plugin',
      );

      await runStartupPlugins(clientOpts, 'my connection');
      expect(
        getPluginConfigParamByConnectionKey(
          'my connection',
          'NEW_VAR_ADDED_TO_CONNECTION',
        ),
      ).toEqual('access-token');
      await runStartupPlugins(clientOpts, 'my connection 2');
      expect(
        getPluginConfigParamByConnectionKey(
          'my connection 2',
          'NEW_VAR_ADDED_TO_CONNECTION_2',
        ),
      ).toEqual('access-token');

      await runStartupPlugins(clientOpts, 'my connection 3');
      expect(
        getPluginConfigParamByConnectionKey(
          'my connection 3',
          'NEW_VAR_ADDED_TO_CONNECTION_FROM_DUMMY3_PLUGIN',
        ),
      ).toEqual('access-token-dummy3');
      expect(
        getPluginConfigParamByConnectionKey(
          'my connection 3',
          'NEW_VAR_ADDED_TO_CONNECTION_FROM_SECOND_DUMMY3_PLUGIN',
        ),
      ).toEqual('access-token-dummy3');

      const requestDetails: PostFilterPreparedRequest = {
        url: 'http://bla',
        headers: { myHeader: 'my_value' },
        method: 'POST',
        body: { myField: 'my field value' },
      };
      const requestBodyDetailsOriginal = Object.assign({}, requestDetails.body);
      const expectedRequestBody = Object.assign({}, requestDetails.body);
      expectedRequestBody['NEW_VAR_ADDED_TO_CONNECTION'] = 'access-token';
      const request = await runPreRequestPlugins(
        clientOpts,
        clientOpts.config.connections['my connection'].identifier,
        requestDetails,
        null,
      );
      expect(request.body).not.toEqual(requestBodyDetailsOriginal);
      expect(request.body).toEqual(expectedRequestBody);

      const requestDetails2: PostFilterPreparedRequest = {
        url: 'http://bla',
        headers: { myHeader: 'my_value' },
        method: 'POST',
        body: { myField: 'my field value' },
      };
      const requestBodyDetailsOriginal2 = Object.assign(
        {},
        requestDetails2.body,
      );
      const request2 = await runPreRequestPlugins(
        clientOpts,
        clientOpts.config.connections['my connection 2'].identifier,
        requestDetails2,
        null,
      );
      expect(request2.body).toEqual(requestBodyDetailsOriginal2);

      const requestDetails3: PostFilterPreparedRequest = {
        url: 'http://bla',
        headers: { myHeader: 'my_value' },
        method: 'POST',
        body: { myField: 'my field value' },
      };
      const requestBodyDetailsOriginal3 = Object.assign(
        {},
        requestDetails3.body,
      );
      const expectedRequestBody3 = Object.assign({}, requestDetails3.body);
      expectedRequestBody3['NEW_VAR_ADDED_TO_CONNECTION_FROM_DUMMY3_PLUGIN'] =
        'access-token-dummy3';
      expectedRequestBody3[
        'NEW_VAR_ADDED_TO_CONNECTION_FROM_SECOND_DUMMY3_PLUGIN'
      ] = 'access-token-dummy3';
      const request3 = await runPreRequestPlugins(
        clientOpts,
        clientOpts.config.connections['my connection 3'].identifier,
        requestDetails3,
        null,
      );
      expect(request3).not.toEqual(requestBodyDetailsOriginal3);
      expect(request3.body).toEqual(expectedRequestBody3);
    } catch (err) {
      // we should not error
      expect(err).toBeNull();
    }
  });
});

describe('Plugin Manager', () => {
  const pluginsFolderPath = `${findProjectRoot(
    __dirname,
  )}/test/fixtures/pluginsDuplicates`;

  it('should fail loading plugins if same name', async () => {
    const clientOpts = {
      config: {
        universalBrokerEnabled: true,
        supportedBrokerTypes: ['dummy'],
        connections: { 'my connection': { type: 'dummy' } },
      },
    };
    try {
      await loadPlugins(pluginsFolderPath, clientOpts);
      expect(false).toBeTruthy();
    } catch (err) {
      expect(err).not.toBeNull();
    }
  });
});
