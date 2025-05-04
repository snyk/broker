import { Plugin } from '../../../../lib/hybrid-sdk/client/brokerClientPlugins/plugins/containerRegistryCredentialsFormatting';
import {
  getPluginConfigByConnectionKey,
  getPluginConfigParamByConnectionKeyAndContextId,
  getPluginsConfig,
  PluginConnectionConfig,
} from '../../../../lib/hybrid-sdk/common/config/pluginsConfig';
describe('containerRegistryCredentialsFormatting Plugin', () => {
  it('Instantiate plugin', () => {
    const config = {};
    const plugin = new Plugin(config);

    expect(plugin.pluginName).toEqual(
      'Container Registry Credentials Formatting Plugin',
    );
    expect(plugin.pluginCode).toEqual(
      'CONTAINER_REGISTRY_CREDENTIALS_FORMAT_PLUGIN',
    );
    expect(plugin.applicableBrokerTypes).toEqual([
      'docker-hub',
      'ecr',
      'acr',
      'gcr',
      'artifactory-cr',
      'harbor-cr',
      'quay-cr',
      'github-cr',
      'nexus-cr',
      'digitalocean-cr',
      'gitlab-cr',
      'google-artifact-cr',
    ]);
  });

  it('Plugins fail if missing parameters', async () => {
    const config = {
      connections: {
        'test connection': { CR_CREDENTIALS: '' },
      },
    };
    const plugin = new Plugin(config);

    await expect(
      plugin.startUp('test connection', config.connections),
    ).rejects.toThrow(
      'Plugin CONTAINER_REGISTRY_CREDENTIALS_FORMAT_PLUGIN startup failure: unknown container registry type: <not provided>.',
    );
  });
  it('Plugins fail if missing parameters for ECR', async () => {
    const config = {
      connections: {
        'test connection': { CR_CREDENTIALS: '', type: 'ecr' },
      },
    };
    const plugin = new Plugin(config);

    await expect(
      plugin.startUp('test connection', config.connections['test connection']),
    ).rejects.toThrow(
      'Plugin CONTAINER_REGISTRY_CREDENTIALS_FORMAT_PLUGIN startup failure: ecr requires the following parameters: CR_ROLE_ARN, CR_REGION and CR_EXTERNAL_ID.',
    );
  });
  it('Plugins creates credentials for ECR', async () => {
    const config = {
      connections: {
        'test connection': {
          CR_CREDENTIALS: '',
          type: 'ecr',
          CR_ROLE_ARN: 'test-role',
          CR_REGION: 'test-region',
          CR_EXTERNAL_ID: 'test-external-id',
        },
      },
    };
    const plugin = new Plugin(config);

    await plugin.startUp(
      'test connection',
      config.connections['test connection'],
    );
    expect(getPluginsConfig()['test connection'].CR_CREDENTIALS).toEqual(
      'eyJ0eXBlIjoiZWNyIiwicm9sZUFybiI6InRlc3Qtcm9sZSIsImV4dHJhIjp7InJlZ2lvbiI6InRlc3QtcmVnaW9uIiwiZXh0ZXJuYWxJZCI6InRlc3QtZXh0ZXJuYWwtaWQifX0K',
    );
  });
  it('Plugins fail if missing stuff for Digital Ocean CR', async () => {
    const config = {
      connections: {
        'test connection': { CR_CREDENTIALS: '', type: 'digitalocean-cr' },
      },
    };
    const plugin = new Plugin(config);

    await expect(
      plugin.startUp('test connection', config.connections['test connection']),
    ).rejects.toThrow(
      'Plugin CONTAINER_REGISTRY_CREDENTIALS_FORMAT_PLUGIN startup failure: digitalocean-cr requires the following parameters: CR_TOKEN.',
    );
  });
  it('Plugins creates credentials for Digital Ocean CR', async () => {
    const config = {
      connections: {
        'test connection': {
          CR_CREDENTIALS: '',
          type: 'digitalocean-cr',
          CR_TOKEN: 'test-token',
        },
      },
    };
    const plugin = new Plugin(config);

    await plugin.startUp(
      'test connection',
      config.connections['test connection'],
    );
    expect(getPluginsConfig()['test connection'].CR_CREDENTIALS).toEqual(
      'eyJ0eXBlIjoiZGlnaXRhbG9jZWFuLWNyIiwgInVzZXJuYW1lIjoidGVzdC10b2tlbiIsICJwYXNzd29yZCI6InRlc3QtdG9rZW4iLCAicmVnaXN0cnlCYXNlIjoidW5kZWZpbmVkIn0K',
    );
  });
  it('Plugins fail if missing stuff for any other type of CR', async () => {
    const config = {
      connections: {
        'test connection': { CR_CREDENTIALS: '', type: 'gitlab-cr' },
      },
    };
    const plugin = new Plugin(config);

    await expect(
      plugin.startUp('test connection', config.connections['test connection']),
    ).rejects.toThrow(
      `Plugin CONTAINER_REGISTRY_CREDENTIALS_FORMAT_PLUGIN startup failure: ${config.connections['test connection'].type} requires the following parameters: CR_USERNAME,CR_PASSWORD.`,
    );
  });
  it('Plugins creates credentials for any type of CR', async () => {
    const config = {
      connections: {
        'test connection': {
          CR_CREDENTIALS: '',
          type: 'gitlab-cr',
          CR_USERNAME: 'test-username',
          CR_PASSWORD: 'test-password',
        },
      },
    };
    const plugin = new Plugin(config);

    await plugin.startUp(
      'test connection',
      config.connections['test connection'],
    );
    expect(getPluginsConfig()['test connection'].CR_CREDENTIALS).toEqual(
      'eyJ0eXBlIjoiZ2l0bGFiLWNyIiwgInVzZXJuYW1lIjoidGVzdC11c2VybmFtZSIsICJwYXNzd29yZCI6InRlc3QtcGFzc3dvcmQiLCAicmVnaXN0cnlCYXNlIjoidW5kZWZpbmVkIn0K',
    );
  });
  it('Plugins creates credentials for any type of CR with context', async () => {
    const config = {
      connections: {
        'test connection': {
          CR_CREDENTIALS: '',
          type: 'gitlab-cr',
          CR_USERNAME: 'test-username',
          CR_PASSWORD: 'test-password',
          contexts: {
            'test context': {
              CR_PASSWORD: 'test-password-context',
            },
          },
        },
      },
    };
    const plugin = new Plugin(config);

    await plugin.startUp(
      'test connection',
      config.connections['test connection'],
    );
    await plugin.startUpContext(
      'test connection',
      'test context',
      {
        ...config.connections['test connection'],
        ...config.connections['test connection'].contexts['test context'],
        test: 'value',
      },
      getPluginConfigByConnectionKey(
        'test connection',
      ) as unknown as PluginConnectionConfig,
    );

    expect(
      getPluginConfigParamByConnectionKeyAndContextId(
        'test connection',
        'test context',
        'CR_CREDENTIALS',
      ),
    ).toEqual(
      'eyJ0eXBlIjoiZ2l0bGFiLWNyIiwgInVzZXJuYW1lIjoidGVzdC11c2VybmFtZSIsICJwYXNzd29yZCI6InRlc3QtcGFzc3dvcmQtY29udGV4dCIsICJyZWdpc3RyeUJhc2UiOiJ1bmRlZmluZWQifQo=',
    );
  });
});
