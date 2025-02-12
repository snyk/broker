import { aConfig } from '../../../../helpers/test-factories';
import { validateBrokerServerUrl } from '../../../../../lib/client/checks/config/brokerServerUrlCheck';

describe('client/checks/config', () => {
  describe('validateBrokerClientUrl()', () => {
    it('should return error check result if protocol is missing', async () => {
      const id = `check_${Date.now()}`;
      const config = aConfig({
        BROKER_SERVER_URL: 'broker.snyk.io',
      });

      const checkResult = await validateBrokerServerUrl(
        { id: id, name: id },
        config,
      );

      expect(checkResult.status).toEqual('error');
      expect(checkResult.output).toContain('Configured URL: broker.snyk.io');
    });

    it('should return error check result for non http(s) protocol', async () => {
      const id = `check_${Date.now()}`;
      const config = aConfig({
        BROKER_SERVER_URL: 'ftp://broker.snyk.io',
      });

      const checkResult = await validateBrokerServerUrl(
        { id: id, name: id },
        config,
      );

      expect(checkResult.status).toEqual('error');
      expect(checkResult.output).toContain(
        'Configured URL: ftp://broker.snyk.io',
      );
    });

    it('should return passing check result for http protocol', async () => {
      const id = `check_${Date.now()}`;
      const config = aConfig({
        BROKER_SERVER_URL: 'http://broker.snyk.io:8000',
      });

      const checkResult = await validateBrokerServerUrl(
        { id: id, name: id },
        config,
      );

      expect(checkResult.status).toEqual('passing');
      expect(checkResult.output).toContain('config check: ok');
    });
  });
});
