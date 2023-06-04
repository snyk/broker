import { aConfig } from '../../../helpers/test-factories';
import { getHttpChecks } from '../../../../lib/client/checks/http';

describe('client/checks', () => {
  describe('preflightChecksEnabled()', () => {
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
      expect(httpChecks[0].enabled).toEqual(false);
    });
  });
});
