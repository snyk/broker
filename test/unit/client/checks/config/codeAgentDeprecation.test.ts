import { validateCodeAgentDeprecation } from '../../../../../lib/hybrid-sdk/client/checks/config/codeAgentDeprecation';
import { aConfig } from '../../../../helpers/test-factories';

describe('client/checks/config', () => {
  describe('validateCodeAgentDeprecation()', () => {
    it('should return pasing check result if code agent config is not detected', async () => {
      const id = `check_${Date.now()}`;
      const config = aConfig({});

      const checkResult = validateCodeAgentDeprecation(
        { id: id, name: id },
        config,
      );
      expect(checkResult.status).toEqual('passing');
      expect(checkResult.output).toContain('Code Agent not in use.');
    });

    it('should return warning check result if code agent config is detected', async () => {
      const id = `check_${Date.now()}`;
      const config = aConfig({
        GIT_CLIENT_URL: 'http://codeagent',
      });

      const checkResult = validateCodeAgentDeprecation(
        { id: id, name: id },
        config,
      );
      expect(checkResult.status).toEqual('warning');
      expect(checkResult.output).toContain(
        'Code Agent is deprecated. Please move to broker only Snyk Code support.',
      );
    });

    it('should return passing check result if code agent config is detected but preflight check is disabled', async () => {
      const id = `check_${Date.now()}`;
      const config = aConfig({
        GIT_CLIENT_URL: 'http://codeagent',
        DISABLE_CODE_AGENT_PREFLIGHT_CHECK: 'any value',
      });

      const checkResult = validateCodeAgentDeprecation(
        { id: id, name: id },
        config,
      );
      expect(checkResult.status).toEqual('passing');
      expect(checkResult.output).toContain(
        'Code Agent Preflight Check disabled.',
      );
    });
  });
});
