import {
  loadPlugins,
  runPreRequestPlugins,
  runStartupPlugins,
} from '../../../lib/client/brokerClientPlugins/pluginManager';
import { findProjectRoot } from '../../../lib/common/config/config';
import { PostFilterPreparedRequest } from '../../../lib/common/relay/prepareRequest';

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
        clientOpts.config.connections['my connection'][
          'NEW_VAR_ADDED_TO_CONNECTION'
        ],
      ).toEqual('access-token');
    } catch (err) {
      // we should not error
      expect(err).toBeNull();
    }
    delete clientOpts.config.connections['my connection'][
      'NEW_VAR_ADDED_TO_CONNECTION'
    ];
  });

  it('should run prerequest plugins successfully', async () => {
    const clientOpts = {
      config: {
        universalBrokerEnabled: true,
        supportedBrokerTypes: ['dummy'],
        connections: { 'my connection': { type: 'dummy', identifier: '123' } },
      },
    };
    try {
      const plugins = await loadPlugins(pluginsFolderPath, clientOpts);
      expect(plugins.get('dummy').length).toBeGreaterThanOrEqual(1);
      expect(plugins.get('dummy')[0].pluginName).toEqual('Dummy Plugin');

      await runStartupPlugins(clientOpts, 'my connection');
      expect(
        clientOpts.config.connections['my connection'][
          'NEW_VAR_ADDED_TO_CONNECTION'
        ],
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
      },
    };
    try {
      const plugins = await loadPlugins(pluginsFolderPath, clientOpts);
      expect(plugins.get('dummy2').length).toBeGreaterThanOrEqual(1);
      expect(plugins.get('dummy2')[0].pluginName).toEqual('Dummy Plugin 2');

      await runStartupPlugins(clientOpts, 'my connection 2');
      expect(
        clientOpts.config.connections['my connection 2'][
          'NEW_VAR_ADDED_TO_CONNECTION_2'
        ],
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
      );
      expect(request.body).toEqual(requestBodyDetailsOriginal);
    } catch (err) {
      // we should not error
      expect(err).toBeNull();
    }
    delete clientOpts.config.connections['my connection 2'][
      'NEW_VAR_ADDED_TO_CONNECTION_2'
    ];
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
      },
    };
    try {
      const plugins = await loadPlugins(pluginsFolderPath, clientOpts);
      expect(plugins.get('dummy').length).toBeGreaterThanOrEqual(1);
      expect(plugins.get('dummy')[0].pluginName).toEqual('Dummy Plugin');
      expect(plugins.get('dummy2').length).toBeGreaterThanOrEqual(1);
      expect(plugins.get('dummy2')[0].pluginName).toEqual('Dummy Plugin 2');

      await runStartupPlugins(clientOpts, 'my connection');
      expect(
        clientOpts.config.connections['my connection'][
          'NEW_VAR_ADDED_TO_CONNECTION'
        ],
      ).toEqual('access-token');
      await runStartupPlugins(clientOpts, 'my connection 2');
      expect(
        clientOpts.config.connections['my connection 2'][
          'NEW_VAR_ADDED_TO_CONNECTION_2'
        ],
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
      );
      expect(request2.body).toEqual(requestBodyDetailsOriginal2);
    } catch (err) {
      // we should not error
      expect(err).toBeNull();
    }
    delete clientOpts.config.connections['my connection'][
      'NEW_VAR_ADDED_TO_CONNECTION'
    ];
    delete clientOpts.config.connections['my connection 2'][
      'NEW_VAR_ADDED_TO_CONNECTION_2'
    ];
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
      },
    };
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
        clientOpts.config.connections['my connection'][
          'NEW_VAR_ADDED_TO_CONNECTION'
        ],
      ).toEqual('access-token');
      await runStartupPlugins(clientOpts, 'my connection 2');
      expect(
        clientOpts.config.connections['my connection 2'][
          'NEW_VAR_ADDED_TO_CONNECTION_2'
        ],
      ).toEqual('access-token');
      await runStartupPlugins(clientOpts, 'my connection 3');
      expect(
        clientOpts.config.connections['my connection 3'][
          'NEW_VAR_ADDED_TO_CONNECTION_FROM_DUMMY3_PLUGIN'
        ],
      ).toEqual('access-token-dummy3');
      expect(
        clientOpts.config.connections['my connection 3'][
          'NEW_VAR_ADDED_TO_CONNECTION_FROM_SECOND_DUMMY3_PLUGIN'
        ],
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
