import { aConfig } from '../../../../helpers/test-factories';
import { validateBrokerClientUrl } from '../../../../../lib/client/checks/config/brokerClientUrlCheck';

describe('client/checks/config', () => {
  describe('validateBrokerClientUrl()', () => {
    it('should return error check result if protocol is missing', () => {
      const id = `check_${Date.now()}`;
      const config = aConfig({
        BROKER_CLIENT_URL: 'broker-client:8000',
      });

      const checkResult = validateBrokerClientUrl({ id: id, name: id }, config);

      expect(checkResult.status).toEqual('error');
      expect(checkResult.output).toContain(
        'Configured URL: broker-client:8000',
      );
    });

    it('should return error check result for non http(s) protocol', () => {
      const id = `check_${Date.now()}`;
      const config = aConfig({
        BROKER_CLIENT_URL: 'ftp://broker-client:8000',
      });

      const checkResult = validateBrokerClientUrl({ id: id, name: id }, config);

      expect(checkResult.status).toEqual('error');
      expect(checkResult.output).toContain(
        'Configured URL: ftp://broker-client:8000',
      );
    });

    it('should return error check result for https protocol without certificate and key', () => {
      const id = `check_${Date.now()}`;
      const config = aConfig({
        BROKER_CLIENT_URL: 'https://broker-client:8000',
      });

      const checkResult = validateBrokerClientUrl({ id: id, name: id }, config);

      expect(checkResult.status).toEqual('error');
      expect(checkResult.output).toContain(
        'HTTPS_CERT and HTTPS_KEY environment variables are missing',
      );
    });

    it('should return warning check result for localhost', () => {
      const id = `check_${Date.now()}`;
      const config = aConfig({
        BROKER_CLIENT_URL: 'http://localhost:8000',
      });

      const checkResult = validateBrokerClientUrl({ id: id, name: id }, config);

      expect(checkResult.status).toEqual('warning');
      expect(checkResult.output).toContain(
        'Broker Client URL is configured for localhost',
      );
    });

    it('should return passing check result for http protocol', () => {
      const id = `check_${Date.now()}`;
      const config = aConfig({
        BROKER_CLIENT_URL: 'http://broker-client:8000',
      });

      const checkResult = validateBrokerClientUrl({ id: id, name: id }, config);

      expect(checkResult.status).toEqual('passing');
      expect(checkResult.output).toContain('config check: ok');
    });

    it('should return passing check result for https protocol with certificate and key', () => {
      const id = `check_${Date.now()}`;
      const config = aConfig({
        BROKER_CLIENT_URL: 'https://broker-client:8000',
        HTTPS_CERT: 'path-to-cert',
        HTTPS_KEY: 'path-to-key',
      });

      const checkResult = validateBrokerClientUrl({ id: id, name: id }, config);

      expect(checkResult.status).toEqual('passing');
      expect(checkResult.output).toContain('config check: ok');
    });
  });
});
