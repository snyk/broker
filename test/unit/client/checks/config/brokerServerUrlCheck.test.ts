import { aConfig } from '../../../../helpers/test-factories';
import { validateBrokerServerUrl } from '../../../../../lib/hybrid-sdk/client/checks/config/brokerServerUrlCheck';
import { log as logger } from '../../../../../lib/logs/logger';
import * as urlValidator from '../../../../../lib/hybrid-sdk/common/utils/urlValidator';

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

  describe('validateBrokerServerUrl() — rethrow preservation', () => {
    let debugSpy: jest.SpyInstance;

    beforeEach(() => {
      jest.clearAllMocks();
      debugSpy = jest.spyOn(logger, 'debug').mockImplementation(() => {});
    });
    afterEach(() => jest.restoreAllMocks());

    it('preserves the original Error instance, message, and code on rethrow', async () => {
      const original = new Error('ENOTFOUND broker.example.com') as Error & {
        code?: string;
      };
      original.code = 'ENOTFOUND';
      jest.spyOn(urlValidator, 'isHttpUrl').mockImplementation(() => {
        throw original;
      });

      const config = aConfig({
        BROKER_SERVER_URL: 'https://broker.example.com',
      });

      let caught: unknown;
      try {
        await validateBrokerServerUrl({ id: 'check-srv', name: 'X' }, config);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBe(original);
      expect((caught as Error).message).toContain('check-srv');
      expect((caught as Error).message).toContain(
        'ENOTFOUND broker.example.com',
      );
      expect((caught as any).code).toBe('ENOTFOUND');
    });

    it('wraps a non-Error throwable in an Error, preserving the original via cause', async () => {
      const original = 'not an Error instance';
      jest.spyOn(urlValidator, 'isHttpUrl').mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw original;
      });

      const config = aConfig({
        BROKER_SERVER_URL: 'https://broker.example.com',
      });

      let caught: unknown;
      try {
        await validateBrokerServerUrl({ id: 'check-srv', name: 'X' }, config);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toContain('check-srv');
      expect((caught as Error).message).toContain('not an Error instance');
      expect((caught as Error).cause).toBe(original);
    });

    it('does not log at the local catch site (upstream catch logs structurally)', async () => {
      jest.spyOn(urlValidator, 'isHttpUrl').mockImplementation(() => {
        throw new Error('boom');
      });
      const config = aConfig({
        BROKER_SERVER_URL: 'https://broker.example.com',
      });

      try {
        await validateBrokerServerUrl({ id: 'check-srv', name: 'X' }, config);
      } catch {
        // expected
      }

      expect(debugSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.anything() }),
        expect.stringContaining('Error executing check with checkId'),
      );
    });
  });
});
