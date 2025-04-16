import { Plugin } from '../../../../lib/hybrid-sdk/client/brokerClientPlugins/plugins/githubServerAppAuth';
// import nock from 'nock';
import { delay } from '../../../helpers/utils';
import {
  getPluginConfigSubKey,
  setPluginConfigKey,
} from '../../../../lib/hybrid-sdk/common/config/pluginsConfig';
import * as request from '../../../../lib/hybrid-sdk/http/request';

jest.mock('../../../../lib/hybrid-sdk/http/request');

const mockedRequest = jest.mocked(request);
describe('Github Server App Plugin', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockedRequest.makeRequestToDownstream.mockResolvedValue({
      statusCode: 200,
      headers: {},
      body: JSON.stringify({
        token: 'mynewtokenvalue',
        expires_at: '2024-05-15T10:40:32Z',
        permissions: {
          contents: 'write',
        },
        repository_selection: 'all',
      }),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  it('Test access token lifecycle Handler timers', async () => {
    const jwt =
      'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3MTU3NjU2MDUsImV4cCI6MTcxNTc2NjI2NSwiaXNzIjoiMTMyNDU2NyJ9.K3bXPczfBSrBIiFdyJ9-PsYJAG6y0t0cNulnasS2ejcW9J8uCf4xdk1kp4z42Wka7UpcBKrHjZKlnjCA8e7Ge-NCtgW9_f3jX4kfXqagI7bdxaEgckWKkg2DSNNtZuT3WuXFEWKxQ5tIDB4npzFqrzL4_r2hQOjt9W81gA2oPHdIakY6juXZSAOen-O3KbB3dOzllj0kR7LZ5IKz7O2bVQcCRWw8dPoJQIPzpCv0iwf6SS6pAjXYj_9Slkw8REjPSVGlJozLmW9qjNl67s669OMnwOSqNn9B_Unegb599ZjUrZ4u0udo6Gk6TBnDqnd5qthcM8C6Ym6WG98UrxB27w';
    const dummyAppInstallId = '1324567';
    const dummyAccessToken = {
      token: 'mytokenvalue',
      expires_at: `${
        new Date(new Date().getTime() + 100).toISOString().slice(0, -5) + 'Z'
      }`,
      permissions: {
        contents: 'write',
      },
      repository_selection: 'all',
    };
    const renewedDummyAccessToken = {
      token: 'mynewtokenvalue',
      expires_at: '2024-05-15T10:40:32Z',
      permissions: {
        contents: 'write',
      },
      repository_selection: 'all',
    };

    const config = {
      ghaAccessToken: JSON.stringify(dummyAccessToken),
      GITHUB_API: 'dummyendpoint',
      GITHUB_APP_INSTALLATION_ID: dummyAppInstallId,
      JWT_TOKEN: `${jwt}`,
    };
    const plugin = new Plugin(config);
    setPluginConfigKey('test connection', { ...config });
    // Exist only in the local cfg for testing purpose
    expect(getPluginConfigSubKey('test connection', 'GHA_ACCESS_TOKEN'))
      .toBeUndefined;

    plugin._setAccessTokenLifecycleHandler('test connection', config);
    jest.advanceTimersByTime(10000);
    await Promise.resolve();
    const promise = delay(1000);
    jest.advanceTimersByTime(1000);
    await promise;

    const updatedGhaAccessToken = getPluginConfigSubKey(
      'test connection',
      'GHA_ACCESS_TOKEN',
    );
    expect(updatedGhaAccessToken).toEqual(renewedDummyAccessToken.token);
  });
});
