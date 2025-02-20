import { aConfig } from '../../../helpers/test-factories';
import { getConfigChecks } from '../../../../lib/hybrid-sdk/client/checks/config';
import { getHttpChecks } from '../../../../lib/hybrid-sdk/client/checks/http';

describe('client/checks', () => {
  describe('preflightChecksEnabled()', () => {
    it('should return true for broker-client-url-validation.enabled if broker client url is configured', () => {
      const config = aConfig({
        BROKER_CLIENT_URL: 'http://broker-client:8000',
      });

      const configChecks = getConfigChecks(config).filter(
        (c) => c.id === 'broker-client-url-validation',
      );

      expect(configChecks).toHaveLength(1);
      expect(configChecks[0].enabled).toEqual(true);
    });

    it('should return false for broker-client-url-validation.enabled if broker client url is configured empty', () => {
      const config = aConfig({
        BROKER_CLIENT_URL: '',
      });

      const configChecks = getConfigChecks(config).filter(
        (c) => c.id === 'broker-client-url-validation',
      );

      expect(configChecks).toHaveLength(1);
      expect(configChecks[0].enabled).toEqual(false);
    });

    it('should return false for broker-client-url-validation.enabled if broker client url is not configured at all', () => {
      const config = aConfig({
        BROKER_CLIENT_URL: '',
      });
      delete config['BROKER_CLIENT_URL'];
      const configChecks = getConfigChecks(config).filter(
        (c) => c.id === 'broker-client-url-validation',
      );

      expect(configChecks).toHaveLength(1);
      expect(configChecks[0].enabled).toEqual(false);
    });

    it('should return true for rest-api-status.enabled if high availability mode is on', async () => {
      const config = aConfig({
        BROKER_HA_MODE_ENABLED: 'true',
      });
      const httpChecks = getHttpChecks(config).filter(
        (c) => c.id === 'rest-api-status',
      );

      expect(httpChecks).toHaveLength(1);
      expect(httpChecks[0].enabled).toEqual(true);
    });

    it('should return false for rest-api-status.enabled if high availability mode is off', async () => {
      const config = aConfig({
        BROKER_HA_MODE_ENABLED: 'false',
      });
      const httpChecks = getHttpChecks(config).filter(
        (c) => c.id === 'rest-api-status',
      );

      expect(httpChecks).toHaveLength(1);
      expect(httpChecks[0].enabled).toEqual(true);
    });
  });
});
