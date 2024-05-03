import { validateAcceptFlagsConfig } from '../../../../../lib/client/checks/config/customAcceptFile';
import { aConfig } from '../../../../helpers/test-factories';

describe('client/checks/config', () => {
  describe('validateAcceptFlagsConfig()', () => {
    it('should return error check result if incompatible ACCEPT flags', async () => {
      const id = `check_${Date.now()}`;
      const config = aConfig({
        ACCEPT_CODE: true,
        ACCEPT: '/path/to/custom/accept/file',
      });

      const checkResult = validateAcceptFlagsConfig(
        { id: id, name: id },
        config,
      );
      expect(checkResult.status).toEqual('error');
      expect(checkResult.output).toContain(
        'ACCEPT_ flags are not compatible with custom accept.json files. Please refrain from using custom accept json (Code Agent is deprecated, see documentation).',
      );
    });

    it('should return error check result if incompatible ACCEPT numerous flags', async () => {
      const id = `check_${Date.now()}`;
      const config = aConfig({
        ACCEPT_GIT: true,
        ACCEPT_IAC: true,
        ACCEPT_APPRISK: true,
        ACCEPT: '/path/to/custom/accept/file',
      });

      const checkResult = validateAcceptFlagsConfig(
        { id: id, name: id },
        config,
      );
      expect(checkResult.status).toEqual('error');
      expect(checkResult.output).toContain(
        'ACCEPT_ flags are not compatible with custom accept.json files. Please refrain from using custom accept json (Code Agent is deprecated, see documentation).',
      );
    });

    it('should return passing check result if only ACCEPT custom file configured', async () => {
      const id = `check_${Date.now()}`;
      const config = aConfig({
        ACCEPT: '/path/to/custom/accept/file',
      });

      const checkResult = validateAcceptFlagsConfig(
        { id: id, name: id },
        config,
      );
      expect(checkResult.status).toEqual('passing');
      expect(checkResult.output).toContain('ACCEPT flags configuration OK.');
    });

    it('should return passing check result if only ACCEPT_ flags configured', async () => {
      const id = `check_${Date.now()}`;
      const config = aConfig({
        ACCEPT_CODE: true,
      });

      const checkResult = validateAcceptFlagsConfig(
        { id: id, name: id },
        config,
      );
      expect(checkResult.status).toEqual('passing');
      expect(checkResult.output).toContain('ACCEPT flags configuration OK.');
    });
  });
});
