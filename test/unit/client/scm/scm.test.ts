import { aConfig } from '../../../helpers/test-factories';
import {
  commitSigningEnabled,
  signGitHubCommit,
} from '../../../../lib/hybrid-sdk/client/scm';

describe('client/scm', () => {
  describe('commitSigningEnabled()', () => {
    it('should return true if all commit singing options are defined', async () => {
      const config = aConfig({
        GPG_PASSPHRASE: 'gpg-passphrase',
        GPG_PRIVATE_KEY: 'gpg-private-key',
        GIT_COMMITTER_NAME: 'test-broker',
        GIT_COMMITTER_EMAIL: 'test-broker@example.com',
      });

      expect(commitSigningEnabled(config)).toEqual(true);
    });

    it('should return false if gpg passphrase is undefined', async () => {
      const config = aConfig({
        GPG_PASSPHRASE: undefined,
        GPG_PRIVATE_KEY: 'gpg-private-key',
        GIT_COMMITTER_NAME: 'test-broker',
        GIT_COMMITTER_EMAIL: 'test-broker@example.com',
      });

      expect(commitSigningEnabled(config)).toEqual(false);
    });

    it('should return false if gpg passphrase is empty', async () => {
      const config = aConfig({
        GPG_PASSPHRASE: '',
        GPG_PRIVATE_KEY: 'gpg-private-key',
        GIT_COMMITTER_NAME: 'test-broker',
        GIT_COMMITTER_EMAIL: 'test-broker@example.com',
      });

      expect(commitSigningEnabled(config)).toEqual(false);
    });

    it('should return false if gpg private key is undefined', async () => {
      const config = aConfig({
        GPG_PASSPHRASE: 'gpg-passphrase',
        GPG_PRIVATE_KEY: undefined,
        GIT_COMMITTER_NAME: 'test-broker',
        GIT_COMMITTER_EMAIL: 'test-broker@example.com',
      });

      expect(commitSigningEnabled(config)).toEqual(false);
    });

    it('should return false if gpg private key is empty', async () => {
      const config = aConfig({
        GPG_PASSPHRASE: 'gpg-passphrase',
        GPG_PRIVATE_KEY: '',
        GIT_COMMITTER_NAME: 'test-broker',
        GIT_COMMITTER_EMAIL: 'test-broker@example.com',
      });

      expect(commitSigningEnabled(config)).toEqual(false);
    });

    it('should return false if git committer name is undefined', async () => {
      const config = aConfig({
        GPG_PASSPHRASE: 'gpg-passphrase',
        GPG_PRIVATE_KEY: 'gpg-private-key',
        GIT_COMMITTER_NAME: undefined,
        GIT_COMMITTER_EMAIL: 'test-broker@example.com',
      });

      expect(commitSigningEnabled(config)).toEqual(false);
    });

    it('should return false if git committer name is empty', async () => {
      const config = aConfig({
        GPG_PASSPHRASE: 'gpg-passphrase',
        GPG_PRIVATE_KEY: 'gpg-private-key',
        GIT_COMMITTER_NAME: '',
        GIT_COMMITTER_EMAIL: 'test-broker@example.com',
      });

      expect(commitSigningEnabled(config)).toEqual(false);
    });

    it('should return false if git committer email is undefined', async () => {
      const config = aConfig({
        GPG_PASSPHRASE: 'gpg-passphrase',
        GPG_PRIVATE_KEY: 'gpg-private-key',
        GIT_COMMITTER_NAME: 'test-broker',
        GIT_COMMITTER_EMAIL: undefined,
      });

      expect(commitSigningEnabled(config)).toEqual(false);
    });

    it('should return false if git committer email is empty', async () => {
      const config = aConfig({
        GPG_PASSPHRASE: 'gpg-passphrase',
        GPG_PRIVATE_KEY: 'gpg-private-key',
        GIT_COMMITTER_NAME: 'test-broker',
        GIT_COMMITTER_EMAIL: '',
      });

      expect(commitSigningEnabled(config)).toEqual(false);
    });
  });

  describe('signGitHubCommit()', () => {
    it('should throw an error when body is null', async () => {
      await expect(signGitHubCommit({}, null)).rejects.toThrowError(
        'body must be string or Uint8Array',
      );
    });

    it('should throw an error when body is not string', async () => {
      await expect(signGitHubCommit({}, 123456)).rejects.toThrowError(
        'body must be string or Uint8Array',
      );
    });
  });
});
