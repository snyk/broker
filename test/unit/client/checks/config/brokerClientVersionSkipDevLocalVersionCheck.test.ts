import { validateBrokerClientVersionAgainstServer } from '../../../../../lib/client/checks/config/brokerClientVersionCheck';
import { aConfig } from '../../../../helpers/test-factories';
import nock from 'nock';

const brokerServerUrl = 'https://brokerServer';

jest.mock('../../../../../lib/common/utils/version', () => {
  const originalModule = jest.requireActual(
    '../../../../../lib/common/utils/version',
  );

  return {
    __esModule: true,
    ...originalModule,
    default: () => {
      return 'local';
    },
  };
});

nock(brokerServerUrl)
  .persist()
  .get('/healthcheck')
  .reply(() => {
    return [200, { ok: true, version: '4.179.2' }];
  });

describe('client/checks/config', () => {
  describe('validateBrokerClientVersionAgainstServer()', () => {
    it('should warn about dev version', async () => {
      const id = `check_${Date.now()}`;
      const config = aConfig({});
      config.BROKER_SERVER_URL = brokerServerUrl;

      const checkResult = await validateBrokerClientVersionAgainstServer(
        { id: id, name: id },
        config,
      );
      expect(checkResult.status).toEqual('warning');
      expect(checkResult.output).toContain(
        'Caution! You are running a dev version.',
      );
    });
  });
});
