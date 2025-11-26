import { validateUniversalConnectionsConfig } from '../../../../../lib/hybrid-sdk/client/checks/config/universalConnectionConfigCheck';
import { getConfigForConnectionsFromConfig } from '../../../../../lib/hybrid-sdk/common/config/universal';
import { aUniversalDefaultConfig } from '../../../../helpers/test-factories';

describe('client/checks/config', () => {
  describe('validateBrokerClientUrl()', () => {
    it('should return error check result if no connection configured', async () => {
      const id = `check_${Date.now()}`;
      const config = await aUniversalDefaultConfig({});
      const checkResult = validateUniversalConnectionsConfig(
        { id: id, name: id },
        config,
      );
      expect(checkResult.status).toEqual('error');
      expect(checkResult.output).toContain('Missing connections in config');
    });

    it('should return error check result if no connection type', async () => {
      const id = `check_${Date.now()}`;
      const config = await aUniversalDefaultConfig({
        connections: {
          'my github connection': {
            identifier: '123',
            GITHUB_TOKEN: '${GITHUB_TOKEN}',
          },
        },
      });
      const checkResult = validateUniversalConnectionsConfig(
        { id: id, name: id },
        config,
      );
      expect(checkResult.status).toEqual('error');
      expect(checkResult.output).toContain(
        'Missing type in connection my github connection is unsupported',
      );
    });

    it('should return error check result if unsupported connection type', async () => {
      const id = `check_${Date.now()}`;
      const config = await aUniversalDefaultConfig({
        connections: {
          'my github connection': {
            type: 'invalid_type',
            identifier: '123',
            GITHUB_TOKEN: '${GITHUB_TOKEN}',
          },
        },
      });
      const checkResult = validateUniversalConnectionsConfig(
        { id: id, name: id },
        config,
      );
      expect(checkResult.status).toEqual('error');
      expect(checkResult.output).toContain(
        'invalid_type type in connection my github connection is unsupported',
      );
    });

    it('should return error check result if missing required element for connection type', async () => {
      const id = `check_${Date.now()}`;
      const config = await aUniversalDefaultConfig({
        connections: {
          'my github connection': {
            type: 'github',
            identifier: '${BROKER_TOKEN_1}',
            GITHUB_TOKEN: '${GITHUB_TOKEN}',
          },
        },
      });
      const checkResult = validateUniversalConnectionsConfig(
        { id: id, name: id },
        config,
      );
      expect(checkResult.status).toEqual('error');
      expect(checkResult.output).toContain(
        'Missing BROKER_CLIENT_URL required in connection my github connection',
      );
    });

    it('should return passing check result if all required elements present for connection type', async () => {
      const id = `check_${Date.now()}`;
      const config = await aUniversalDefaultConfig({
        connections: {
          'my github connection': {
            type: 'github',
            identifier: '${BROKER_TOKEN_1}',
            GITHUB_TOKEN: '${GITHUB_TOKEN}',
            BROKER_CLIENT_URL: 'dummy',
          },
        },
      });
      const checkResult = validateUniversalConnectionsConfig(
        { id: id, name: id },
        config,
      );
      expect(checkResult.status).toEqual('passing');
      expect(checkResult.output).toContain('connections config check: ok');
    });

    it('should return passing check result if all required elements present for connection type with client url from env var', async () => {
      const id = `check_${Date.now()}`;
      process.env.BROKER_CLIENT_URL = 'dummy';
      process.env.UNIVERSAL_BROKER_ENABLED = 'true';
      const config = await aUniversalDefaultConfig({
        connections: {
          'my github connection': {
            type: 'github',
            identifier: '${BROKER_TOKEN_1}',
            GITHUB_TOKEN: '${GITHUB_TOKEN}',
          },
        },
      });
      config.connections['my github connection'] =
        getConfigForConnectionsFromConfig(config).get('my github connection')!;
      const checkResult = validateUniversalConnectionsConfig(
        { id: id, name: id },
        config,
      );
      expect(checkResult.status).toEqual('passing');
      expect(checkResult.output).toContain('connections config check: ok');
      delete process.env.BROKER_CLIENT_URL;
    });
  });
});
