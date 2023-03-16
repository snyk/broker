import { aConfig } from '../../../helpers/test-factories';
import { checksConfig } from '../../../../lib/client/checks';
import { createRestApiHealthcheck } from '../../../../lib/client/checks/http/http-checks';

describe('preflight-checks-config', () => {
  it('should contain rest-api-status check if high availability mode is enabled', async () => {
    const config = aConfig({
      BROKER_HA_MODE_ENABLED: 'true',
    });
    const restApiCheck = createRestApiHealthcheck(config);
    const { preflightCheckStore } = await checksConfig(config);

    const actualChecks = await preflightCheckStore.getAll();

    expect(actualChecks).toContainEqual(restApiCheck);
  });

  it('should not contain rest-api-status check if high availability mode is disabled', async () => {
    const config = aConfig({
      BROKER_HA_MODE_ENABLED: 'false',
    });
    const restApiCheck = createRestApiHealthcheck(config);
    const { preflightCheckStore } = await checksConfig(config);

    const actualChecks = await preflightCheckStore.getAll();

    expect(actualChecks).not.toContainEqual(restApiCheck);
  });
});
