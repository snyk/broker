import { Plugin } from '../../../../lib/client/brokerClientPlugins/plugins/githubServerAppAuth';
import { findProjectRoot } from '../../../../lib/common/config/config';
import nock from 'nock';
import { delay } from '../../../helpers/utils';

describe('Github Server App Plugin', () => {
  const pluginsFixturesFolderPath = `${findProjectRoot(
    __dirname,
  )}/test/fixtures/plugins/github-server-app`;

  it('Instantiate plugin', () => {
    const config = {};
    const plugin = new Plugin(config);

    expect(plugin.pluginName).toEqual(
      'Github Server App Authentication Plugin',
    );
    expect(plugin.pluginCode).toEqual('GITHUB_SERVER_APP_PLUGIN');
    expect(plugin.applicableBrokerTypes).toEqual(['github-server-app']);
  });

  it('startUp plugin method errors if missing env vars', async () => {
    const config = {};
    const plugin = new Plugin(config);

    try {
      await plugin.startUp({});

      //we shouldn't hit here
      expect(true).toBeFalsy();
    } catch (err) {
      expect(err).toEqual(
        Error(
          'Error in Github Server App Authentication Plugin-GITHUB_SERVER_APP_PLUGIN startup. Error: Missing environment variable(s) for plugin (GITHUB_APP_CLIENT_ID, GITHUB_APP_PRIVATE_PEM_PATH, GITHUB_APP_INSTALLATION_ID)',
        ),
      );
    }
  });

  it('startUp plugin method errors if invalid pem path', async () => {
    const config = {
      GITHUB_APP_CLIENT_ID: '123',
      GITHUB_APP_INSTALLATION_ID: '123',
      GITHUB_APP_PRIVATE_PEM_PATH: '/invalid/path',
    };
    const plugin = new Plugin(config);

    try {
      await plugin.startUp(config);
      // we shouldn't hit here
      expect(true).toBeFalsy();
    } catch (err) {
      expect(err).toEqual(
        Error(
          'Error in Github Server App Authentication Plugin-GITHUB_SERVER_APP_PLUGIN startup. Error: Pem file path is invalid /invalid/path',
        ),
      );
    }
  });

  it('GetJWT method', () => {
    const dummyPrivateKeyPath = `${pluginsFixturesFolderPath}/dummy.pem`;
    const dummyAppClientId = '1324567';
    const config = {};
    const plugin = new Plugin(config);

    const nowInSeconds = Math.floor(1715765665878 / 1000);
    const jwt = plugin._getJWT(
      nowInSeconds,
      dummyPrivateKeyPath,
      dummyAppClientId,
    );
    expect(jwt).toEqual(
      'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3MTU3NjU2MDUsImV4cCI6MTcxNTc2NjI2NSwiaXNzIjoiMTMyNDU2NyJ9.K3bXPczfBSrBIiFdyJ9-PsYJAG6y0t0cNulnasS2ejcW9J8uCf4xdk1kp4z42Wka7UpcBKrHjZKlnjCA8e7Ge-NCtgW9_f3jX4kfXqagI7bdxaEgckWKkg2DSNNtZuT3WuXFEWKxQ5tIDB4npzFqrzL4_r2hQOjt9W81gA2oPHdIakY6juXZSAOen-O3KbB3dOzllj0kR7LZ5IKz7O2bVQcCRWw8dPoJQIPzpCv0iwf6SS6pAjXYj_9Slkw8REjPSVGlJozLmW9qjNl67s669OMnwOSqNn9B_Unegb599ZjUrZ4u0udo6Gk6TBnDqnd5qthcM8C6Ym6WG98UrxB27w',
    );
  });

  it('GetAccessToken method', async () => {
    const dummyJwt =
      'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3MTU3NjU2MDUsImV4cCI6MTcxNTc2NjI2NSwiaXNzIjoiMTMyNDU2NyJ9.K3bXPczfBSrBIiFdyJ9-PsYJAG6y0t0cNulnasS2ejcW9J8uCf4xdk1kp4z42Wka7UpcBKrHjZKlnjCA8e7Ge-NCtgW9_f3jX4kfXqagI7bdxaEgckWKkg2DSNNtZuT3WuXFEWKxQ5tIDB4npzFqrzL4_r2hQOjt9W81gA2oPHdIakY6juXZSAOen-O3KbB3dOzllj0kR7LZ5IKz7O2bVQcCRWw8dPoJQIPzpCv0iwf6SS6pAjXYj_9Slkw8REjPSVGlJozLmW9qjNl67s669OMnwOSqNn9B_Unegb599ZjUrZ4u0udo6Gk6TBnDqnd5qthcM8C6Ym6WG98UrxB27w';
    const dummyAppInstallId = '1324567';
    const config = {};
    const dummyAccessToken = {
      token: 'mytokenvalue',
      expires_at: '2024-05-15T10:40:32Z',
      permissions: {
        contents: 'write',
      },
      repository_selection: 'all',
    };
    nock('https://dummyendpoint')
      .persist()
      .post(`/app/installations/${dummyAppInstallId}/access_tokens`)
      .reply(() => {
        return [200, dummyAccessToken];
      });

    const plugin = new Plugin(config);

    const accessToken = await plugin._getAccessToken(
      'dummyendpoint',
      dummyAppInstallId,
      dummyJwt,
    );
    expect(JSON.parse(accessToken)).toEqual(dummyAccessToken);
  });

  it('Test time difference util method', () => {
    const plugin = new Plugin({});
    const nowPlus10s = Date.now() + 10000;
    const timeDifference =
      plugin._getTimeDifferenceInMsToFutureDate(nowPlus10s);
    expect(timeDifference).toBeLessThanOrEqual(10000);
    expect(timeDifference).toBeGreaterThanOrEqual(9990);
  });

  it('Test JWT lifecycle Handler', async () => {
    const jwt =
      'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3MTU3NjU2MDUsImV4cCI6MTcxNTc2NjI2NSwiaXNzIjoiMTMyNDU2NyJ9.K3bXPczfBSrBIiFdyJ9-PsYJAG6y0t0cNulnasS2ejcW9J8uCf4xdk1kp4z42Wka7UpcBKrHjZKlnjCA8e7Ge-NCtgW9_f3jX4kfXqagI7bdxaEgckWKkg2DSNNtZuT3WuXFEWKxQ5tIDB4npzFqrzL4_r2hQOjt9W81gA2oPHdIakY6juXZSAOen-O3KbB3dOzllj0kR7LZ5IKz7O2bVQcCRWw8dPoJQIPzpCv0iwf6SS6pAjXYj_9Slkw8REjPSVGlJozLmW9qjNl67s669OMnwOSqNn9B_Unegb599ZjUrZ4u0udo6Gk6TBnDqnd5qthcM8C6Ym6WG98UrxB27w';
    const dummyPrivateKeyPath = `${pluginsFixturesFolderPath}/dummy.pem`;
    const dummyAppClientId = '1324567';
    const config = {
      GITHUB_APP_PRIVATE_PEM_PATH: dummyPrivateKeyPath,
      GITHUB_APP_CLIENT_ID: dummyAppClientId,
      JWT_TOKEN: `${jwt}`,
    };
    const plugin = new Plugin(config);
    plugin.JWT_TTL = 10; // overriding for testing
    const now = Date.now();
    plugin._setJWTLifecycleHandler(now, config);
    await delay(100);
    expect(config.JWT_TOKEN).not.toEqual(jwt);
    expect(config.JWT_TOKEN.length).toBeGreaterThan(400);
    clearTimeout(config['jwtTimeoutHandlerId']);
  });

  it('Test access token lifecycle Handler', async () => {
    const jwt =
      'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3MTU3NjU2MDUsImV4cCI6MTcxNTc2NjI2NSwiaXNzIjoiMTMyNDU2NyJ9.K3bXPczfBSrBIiFdyJ9-PsYJAG6y0t0cNulnasS2ejcW9J8uCf4xdk1kp4z42Wka7UpcBKrHjZKlnjCA8e7Ge-NCtgW9_f3jX4kfXqagI7bdxaEgckWKkg2DSNNtZuT3WuXFEWKxQ5tIDB4npzFqrzL4_r2hQOjt9W81gA2oPHdIakY6juXZSAOen-O3KbB3dOzllj0kR7LZ5IKz7O2bVQcCRWw8dPoJQIPzpCv0iwf6SS6pAjXYj_9Slkw8REjPSVGlJozLmW9qjNl67s669OMnwOSqNn9B_Unegb599ZjUrZ4u0udo6Gk6TBnDqnd5qthcM8C6Ym6WG98UrxB27w';
    const dummyAppInstallId = '1324567';
    const dummyAccessToken = {
      token: 'mytokenvalue',
      expires_at: `${
        new Date(new Date().getTime() + 10000).toISOString().slice(0, -5) + 'Z'
      }`,
      permissions: {
        contents: 'write',
      },
      repository_selection: 'all',
    };
    const renewedDummyAccessToken = {
      token: 'mytokenvalue',
      expires_at: '2024-05-15T10:40:32Z',
      permissions: {
        contents: 'write',
      },
      repository_selection: 'all',
    };
    nock('https://dummyendpoint')
      .persist()
      .post(`/app/installations/${dummyAppInstallId}/access_tokens`)
      .reply(() => {
        return [200, renewedDummyAccessToken];
      });
    const config = {
      accessToken: JSON.stringify(dummyAccessToken),
      GITHUB_API: 'dummyendpoint',
      GITHUB_APP_INSTALLATION_ID: dummyAppInstallId,
      JWT_TOKEN: `${jwt}`,
    };
    const plugin = new Plugin(config);
    plugin._setAccessTokenLifecycleHandler(config);
    await delay(100);
    expect(JSON.parse(config.accessToken)).toEqual(renewedDummyAccessToken);
    clearTimeout(config['accessTokenTimeoutHandlerId']);
  });
});
