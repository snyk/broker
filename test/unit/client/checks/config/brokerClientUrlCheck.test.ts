import { aConfig } from '../../../../helpers/test-factories';
import { validateBrokerClientUrl } from '../../../../../lib/hybrid-sdk/client/checks/config/brokerClientUrlCheck';
import { log as logger } from '../../../../../lib/logs/logger';
import * as urlValidator from '../../../../../lib/hybrid-sdk/common/utils/urlValidator';
const nock = require('nock');

describe('client/checks/config', () => {
  describe('validateBrokerClientUrl()', () => {
    it('should return error check result if protocol is missing', async () => {
      const id = `check_${Date.now()}`;
      const config = aConfig({
        BROKER_CLIENT_URL: 'broker-client:8000',
      });

      const checkResult = await validateBrokerClientUrl(
        { id: id, name: id },
        config,
      );

      expect(checkResult.status).toEqual('error');
      expect(checkResult.output).toContain(
        'Configured URL: broker-client:8000',
      );
    });

    it('should return error check result for non http(s) protocol', async () => {
      const id = `check_${Date.now()}`;
      const config = aConfig({
        BROKER_CLIENT_URL: 'ftp://broker-client:8000',
      });

      const checkResult = await validateBrokerClientUrl(
        { id: id, name: id },
        config,
      );

      expect(checkResult.status).toEqual('error');
      expect(checkResult.output).toContain(
        'Configured URL: ftp://broker-client:8000',
      );
    });

    it('should return error check result mentioning both remediation paths when probe fails', async () => {
      const id = `check_${Date.now()}`;
      const config = aConfig({
        BROKER_CLIENT_URL: 'https://broker-client:8000',
      });

      const checkResult = await validateBrokerClientUrl(
        { id: id, name: id },
        config,
      );

      expect(checkResult.status).toEqual('error');
      expect(checkResult.output).toContain('HTTPS_CERT and HTTPS_KEY');
      expect(checkResult.output).toContain('BROKER_CLIENT_URL_TLS_TERMINATED');
      expect(checkResult.output).toMatch(
        /Probe to https:\/\/broker-client:8000\/healthcheck failed/,
      );
    });

    it('should return error check result for https protocol without certificate and key but TLS terminated flag', async () => {
      const id = `check_${Date.now()}`;
      const config = aConfig({
        BROKER_CLIENT_URL: 'https://broker-client:8000',
        BROKER_CLIENT_URL_TLS_TERMINATED: true,
      });

      const checkResult = await validateBrokerClientUrl(
        { id: id, name: id },
        config,
      );

      expect(checkResult.status).toEqual('passing');
      expect(checkResult.output).toContain('config check: ok');
    });

    it('should return error check result for https protocol without certificate and key but TLS terminated', async () => {
      nock('https://broker-client:8000')
        .persist()
        .get('/healthcheck')
        .reply(() => {
          return [200, { ok: true }];
        });
      const id = `check_${Date.now()}`;
      const config = aConfig({
        BROKER_CLIENT_URL: 'https://broker-client:8000',
      });

      const checkResult = await validateBrokerClientUrl(
        { id: id, name: id },
        config,
      );

      expect(checkResult.status).toEqual('passing');
      expect(checkResult.output).toContain('config check: ok');
    });

    it('should return warning check result for localhost', async () => {
      const id = `check_${Date.now()}`;
      const config = aConfig({
        BROKER_CLIENT_URL: 'http://localhost:8000',
      });

      const checkResult = await validateBrokerClientUrl(
        { id: id, name: id },
        config,
      );

      expect(checkResult.status).toEqual('warning');
      expect(checkResult.output).toContain(
        'Broker Client URL is configured for localhost',
      );
    });

    it('should return passing check result for http protocol', async () => {
      const id = `check_${Date.now()}`;
      const config = aConfig({
        BROKER_CLIENT_URL: 'http://broker-client:8000',
      });

      const checkResult = await validateBrokerClientUrl(
        { id: id, name: id },
        config,
      );

      expect(checkResult.status).toEqual('passing');
      expect(checkResult.output).toContain('config check: ok');
    });

    it('should return passing check result for https protocol with certificate and key', async () => {
      const id = `check_${Date.now()}`;
      const config = aConfig({
        BROKER_CLIENT_URL: 'https://broker-client:8000',
        HTTPS_CERT: 'path-to-cert',
        HTTPS_KEY: 'path-to-key',
      });

      const checkResult = await validateBrokerClientUrl(
        { id: id, name: id },
        config,
      );

      expect(checkResult.status).toEqual('passing');
      expect(checkResult.output).toContain('config check: ok');
    });
  });

  /**
   * Regression: the `isBrokerClientUrlTLSTerminated` catch at
   * brokerClientUrlCheck.ts:112 used to log at DEBUG, hiding the underlying
   * network failure at default log level. The customer-visible check output
   * ("HTTPS_CERT and HTTPS_KEY environment variables are missing") is
   * potentially misleading when the real cause is DNS / connection refused /
   * TLS handshake / timeout — so the log must be visible by default (WARN).
   *
   * The test below drives the catch by failing the /healthcheck probe and
   * asserts:
   *  - logger.warn fires (NOT logger.debug)
   *  - the log carries the original err for the operator to triage
   *  - the log carries the probe url so the operator knows what failed
   */
  describe('BROKER_CLIENT_URL probe failure logging', () => {
    let warnSpy: jest.SpyInstance;
    let debugSpy: jest.SpyInstance;

    beforeEach(() => {
      nock.cleanAll();
      warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
      debugSpy = jest.spyOn(logger, 'debug').mockImplementation(() => logger);
    });

    afterEach(() => {
      warnSpy.mockRestore();
      debugSpy.mockRestore();
      nock.cleanAll();
    });

    it('logs at WARN with {err, url} when the BROKER_CLIENT_URL probe fails', async () => {
      nock('https://broker-client:8000')
        .persist()
        .get('/healthcheck')
        .replyWithError(
          Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:443'), {
            code: 'ECONNREFUSED',
          }),
        );

      const config = aConfig({
        BROKER_CLIENT_URL: 'https://broker-client:8000',
      });

      const checkResult = await validateBrokerClientUrl(
        { id: 'broker-client-url-validation', name: 'check' },
        config,
      );

      expect(checkResult.status).toEqual('error');
      expect(checkResult.output).toContain('ECONNREFUSED');
      expect(checkResult.output).toContain('HTTPS_CERT and HTTPS_KEY');
      expect(checkResult.output).toContain('BROKER_CLIENT_URL_TLS_TERMINATED');
      const probeWarn = warnSpy.mock.calls.find(
        ([, msg]) =>
          typeof msg === 'string' &&
          msg.startsWith('Failed to reach the BROKER_CLIENT_URL'),
      );

      expect(probeWarn).toBeDefined();
      const [fields, message] = probeWarn!;
      expect(typeof fields).toBe('object');
      expect(fields).toHaveProperty('err');
      expect(fields).toHaveProperty('url');
      expect(fields.url).toBe('https://broker-client:8000/healthcheck');
      expect(message).toContain('ECONNREFUSED'); // from the nock-mocked err
      const probeDebug = debugSpy.mock.calls.find(
        ([, msg]) =>
          typeof msg === 'string' &&
          msg.startsWith('Failed to reach the BROKER_CLIENT_URL'),
      );
      expect(probeDebug).toBeUndefined();
    });
  });

  describe('validateBrokerClientUrl() — rethrow preservation', () => {
    afterEach(() => jest.restoreAllMocks());

    it('wraps a non-Error throwable in an Error, preserving the original via cause', async () => {
      const original = 'not an Error instance';
      jest.spyOn(urlValidator, 'isHttpUrl').mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw original;
      });
      const config = aConfig({
        BROKER_CLIENT_URL: 'https://broker-client:8000',
      });

      let caught: unknown;
      try {
        await validateBrokerClientUrl({ id: 'check-cli', name: 'X' }, config);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toContain('check-cli');
      expect((caught as Error).message).toContain('not an Error instance');
      expect((caught as Error).cause).toBe(original);
    });
  });
});
