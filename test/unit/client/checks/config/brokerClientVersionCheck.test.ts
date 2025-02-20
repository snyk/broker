import { validateBrokerClientVersionAgainstServer } from '../../../../../lib/hybrid-sdk/client/checks/config/brokerClientVersionCheck';
import { aConfig } from '../../../../helpers/test-factories';
import nock from 'nock';

const brokerServerUrl = 'https://brokerServer';
const brokerServerUrl2 = 'https://brokerServer2';
const brokerServerUrl3 = 'https://brokerServer3';

jest.mock('../../../../../lib/hybrid-sdk/common/utils/version', () => {
  const originalModule = jest.requireActual(
    '../../../../../lib/hybrid-sdk/common/utils/version',
  );

  return {
    __esModule: true,
    ...originalModule,
    default: '4.180.0',
  };
});

nock(brokerServerUrl)
  .persist()
  .get('/healthcheck')
  .reply(() => {
    return [200, { ok: true, version: '4.179.2' }];
  });

nock(brokerServerUrl2)
  .persist()
  .get('/healthcheck')
  .reply(() => {
    return [200, { ok: true, version: '4.191.2' }];
  });

nock(brokerServerUrl3)
  .persist()
  .get('/healthcheck')
  .reply(() => {
    return [200, { ok: true, version: '4.171.2' }];
  });

describe('client/checks/config', () => {
  describe('validateBrokerClientVersionAgainstServer()', () => {
    it('should return passing if version delta is <10', async () => {
      const id = `check_${Date.now()}`;
      const config = aConfig({});
      config.BROKER_SERVER_URL = brokerServerUrl;

      const checkResult = await validateBrokerClientVersionAgainstServer(
        { id: id, name: id },
        config,
      );
      expect(checkResult.status).toEqual('passing');
      expect(checkResult.output).toContain(
        'Running supported broker client version.',
      );
    });

    it('should return passing if version delta is >10', async () => {
      const id = `check_${Date.now()}`;
      const config = aConfig({});
      config.BROKER_SERVER_URL = brokerServerUrl2;

      const checkResult = await validateBrokerClientVersionAgainstServer(
        { id: id, name: id },
        config,
      );
      expect(checkResult.status).toEqual('error');
      expect(checkResult.output).toContain(
        'Your broker client version is outdated. Please upgrade to latest version.',
      );
    });

    it('should return passing if version is more recent than server', async () => {
      const id = `check_${Date.now()}`;
      const config = aConfig({});
      config.BROKER_SERVER_URL = brokerServerUrl3;

      const checkResult = await validateBrokerClientVersionAgainstServer(
        { id: id, name: id },
        config,
      );
      expect(checkResult.status).toEqual('passing');
      expect(checkResult.output).toContain(
        'Running supported broker client version.',
      );
    });

    it('should return passing if version delta is <10', async () => {
      const id = `check_${Date.now()}`;
      const config = aConfig({});
      config.BROKER_SERVER_URL = brokerServerUrl;

      const checkResult = await validateBrokerClientVersionAgainstServer(
        { id: id, name: id },
        config,
      );
      expect(checkResult.status).toEqual('passing');
      expect(checkResult.output).toContain(
        'Running supported broker client version.',
      );
    });
  });
});
