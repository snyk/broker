import { Plugin } from '../../../../lib/hybrid-sdk/client/brokerClientPlugins/plugins/githubServerAppAuth';
import { findProjectRoot } from '../../../../lib/hybrid-sdk/common/config/config';
import { getPluginConfigParamByConnectionKeyAndContextId } from '../../../../lib/hybrid-sdk/common/config/pluginsConfig';
import * as request from '../../../../lib/hybrid-sdk/http/request';

jest.mock('node:crypto');
jest.mock('../../../../lib/hybrid-sdk/http/request');

const mockedRequest = jest.mocked(request);

describe('Github Server App Plugin - startupContext', () => {
  const pluginsFixturesFolderPath = `${findProjectRoot(
    __dirname,
  )}/test/fixtures/plugins/github-server-app`;
  let plugin: Plugin;
  let connectionConfig: Record<string, any>;
  let pluginsConfig: Record<string, any>;
  const connectionName = 'test-connection';
  const contextId = 'test-context-123';

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    jest.useFakeTimers(); // Use fake timers
    jest.spyOn(global, 'setTimeout');
    connectionConfig = {
      friendlyName: connectionName,
      GITHUB_APP_ID: 'app123',
      GITHUB_APP_CLIENT_ID: 'client123',
      GITHUB_APP_INSTALLATION_ID: 'install123',
      GITHUB_APP_PRIVATE_PEM_PATH: `${pluginsFixturesFolderPath}/dummy.pem`,
      GITHUB_API: 'dummy.github.api',
    };
    pluginsConfig = {};

    plugin = new Plugin(connectionConfig);
    (plugin as any).pluginsConfig = pluginsConfig;

    mockedRequest.makeRequestToDownstream.mockResolvedValue({
      statusCode: 200,
      headers: {}, // Add missing headers property
      body: JSON.stringify({
        token: 'mockAccessToken',
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(), // Expires in 1 hour
      }),
    });
  });

  afterEach(() => {
    jest.useRealTimers(); // Restore real timers
  });

  it('should successfully initialize context, set tokens, and schedule refreshes', async () => {
    const initialTime = Date.now();
    jest.setSystemTime(initialTime);

    const getJwtSpy = jest.spyOn(plugin, '_getJWT').mockReturnValue('mockJWT'); // Keep the spy reference
    await plugin.startUpContext(
      connectionName,
      contextId,
      connectionConfig,
      pluginsConfig,
    );

    // Verify JWT generation and storage by checking the spy and the result
    expect(getJwtSpy).toHaveBeenCalledTimes(1);

    expect(
      getPluginConfigParamByConnectionKeyAndContextId(
        connectionName,
        contextId,
        'JWT_TOKEN',
      ),
    ).toBe('mockJWT');

    // Verify Access Token retrieval and storage
    expect(mockedRequest.makeRequestToDownstream).toHaveBeenCalledWith(
      expect.objectContaining({
        url: `https://${connectionConfig.GITHUB_API}/app/installations/${connectionConfig.GITHUB_APP_INSTALLATION_ID}/access_tokens`,
        headers: expect.objectContaining({
          Authorization: 'Bearer mockJWT',
        }),
      }),
    );
    expect(
      getPluginConfigParamByConnectionKeyAndContextId(
        connectionName,
        contextId,
        'ghaAccessToken',
      ),
    ).toBeDefined();
    expect(
      getPluginConfigParamByConnectionKeyAndContextId(
        connectionName,
        contextId,
        'GHA_ACCESS_TOKEN',
      ),
    ).toBe('mockAccessToken');

    // Verify timers are set
    expect(setTimeout).toHaveBeenCalledTimes(2);

    // Verify Access Token timer
    const accessTokenData = JSON.parse(
      getPluginConfigParamByConnectionKeyAndContextId(
        connectionName,
        contextId,
        'ghaAccessToken',
      )!,
    );
    expect(accessTokenData.token).toEqual('mockAccessToken');

    getJwtSpy.mockReturnValue('refreshedMockJWT');
    // Advance timers and check refresh (example for JWT)
    jest.advanceTimersByTime(3600000);

    await Promise.resolve(); // Let microtasks run

    expect(getJwtSpy).toHaveBeenCalledTimes(2); // Initial call + 1 refresh call

    expect(
      getPluginConfigParamByConnectionKeyAndContextId(
        connectionName,
        contextId,
        'JWT_TOKEN',
      ),
    ).toBe('refreshedMockJWT');

    expect(setTimeout).toHaveBeenCalledTimes(3); // Initial JWT, Initial Access Token, Refresh ones
  });

  it('should throw error if required config is missing', async () => {
    const incompleteConfig = { ...connectionConfig };
    delete incompleteConfig.GITHUB_APP_INSTALLATION_ID;

    await expect(
      plugin.startUpContext(
        connectionName,
        contextId,
        incompleteConfig,
        pluginsConfig,
      ),
    ).rejects.toThrow(
      /Missing environment variable\(s\) for plugin \(GITHUB_APP_CLIENT_ID, GITHUB_APP_PRIVATE_PEM_PATH, GITHUB_APP_INSTALLATION_ID\)/,
    );
  });

  it('should throw error if PEM file path is invalid', async () => {
    const configWithInvalidPath = {
      ...connectionConfig,
      GITHUB_APP_PRIVATE_PEM_PATH: '/invalid/path.pem',
    };

    await expect(
      plugin.startUpContext(
        connectionName,
        contextId,
        configWithInvalidPath,
        pluginsConfig,
      ),
    ).rejects.toThrow(/PEM file path is invalid \/invalid\/path\.pem/);
  });

  it('should throw error if JWT generation fails', async () => {
    jest.spyOn(plugin, '_getJWT').mockImplementation(() => {
      throw new Error('JWT generation failed internally');
    });

    await expect(
      plugin.startUpContext(
        connectionName,
        contextId,
        connectionConfig,
        pluginsConfig,
      ),
    ).rejects.toThrow(/JWT generation failed internally/);
  });

  it('should throw error if getting JWT returns null/undefined (internal check)', async () => {
    // Simulate internal logic failing to set the JWT
    // Ensure the spy mock matches the actual return type (string)
    jest.spyOn(plugin, '_getJWT').mockReturnValue(''); // Assign to variable to potentially check calls

    await expect(
      plugin.startUpContext(
        connectionName,
        contextId,
        connectionConfig,
        pluginsConfig,
      ),
    ).rejects.toThrow(/Github app plugin error: could not get JWT/);
  });

  it('should throw error if access token request fails', async () => {
    jest.spyOn(plugin, '_getJWT').mockReturnValue('123');
    mockedRequest.makeRequestToDownstream.mockRejectedValue(
      new Error('Network error'),
    );

    await expect(
      plugin.startUpContext(
        connectionName,
        contextId,
        connectionConfig,
        pluginsConfig,
      ),
    ).rejects.toThrow(/Network error/);
  });

  it('should throw error if access token response is error status code', async () => {
    jest.spyOn(plugin, '_getJWT').mockReturnValue('123');
    mockedRequest.makeRequestToDownstream.mockResolvedValue({
      statusCode: 401,
      headers: {}, // Add missing headers property
      body: 'Unauthorized',
    });

    await expect(
      plugin.startUpContext(
        connectionName,
        contextId,
        connectionConfig,
        pluginsConfig,
      ),
    ).rejects.toThrow(/Unexpected error code 401: Unauthorized/);
  });

  it('should throw error if getting access token returns null/undefined (internal check)', async () => {
    // Simulate internal logic failing to set the access token
    // Ensure the spy mock matches the actual return type (Promise<string>)
    jest.spyOn(plugin, '_getJWT').mockReturnValue('123');
    jest.spyOn(plugin, '_getAccessToken').mockResolvedValue(''); // Assign to variable

    await expect(
      plugin.startUpContext(
        connectionName,
        contextId,
        connectionConfig,
        pluginsConfig,
      ),
    ).rejects.toThrow(/Github app plugin error: could not get access token/);
  });

  it('should throw error if access token parsing fails', async () => {
    jest.spyOn(plugin, '_getJWT').mockReturnValue('123');
    mockedRequest.makeRequestToDownstream.mockResolvedValue({
      statusCode: 200,
      headers: {}, // Add missing headers property
      body: JSON.stringify({ expires_at: 'somedate' }), // Missing 'token' field
    });

    await expect(
      plugin.startUpContext(
        connectionName,
        contextId,
        connectionConfig,
        pluginsConfig,
      ),
    ).rejects.toThrow(
      /Github app plugin Error: could not extract access token/,
    );
  });
});
