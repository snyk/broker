import * as path from 'path';
import {
  createSignature,
  validatePrivateKey,
} from '../../../../../lib/client/scm/pgp/sign';
import { Fixtures } from '../../../../helpers/fixtures';
import { PgpPrivateKeyValidationError } from '../../../../../lib/client/scm/pgp/errors';

const pgpFixturesRoot = path.resolve(Fixtures.getPathToClientFixtures(), 'pgp');
const pgpPrivateKey = Fixtures.get('pgp-private-key.pem', pgpFixturesRoot);

describe('client/scm/pgp/sign.ts', () => {
  const passphrase = 'test-broker-passphrase';

  describe('createSignature()', () => {
    it('should throw an error on misformed armored key', async () => {
      const armoredKey = `-----BEGIN PGP PRIVATE KEY BLOCK-----

invalid-openpgp-format-text
-----END PGP PRIVATE KEY BLOCK-----`;
      await expect(
        createSignature({
          messageRaw: 'message',
          privateKey: { armoredKey },
        }),
      ).rejects.toThrowError();
    });

    it('should throw an error on invalid passphrase', async () => {
      await expect(
        createSignature({
          messageRaw: 'message',
          privateKey: {
            armoredKey: pgpPrivateKey,
            passphrase: 'invalid-passphrase',
          },
        }),
      ).rejects.toThrowError(
        'Error decrypting private key: Incorrect key passphrase',
      );
    });

    it('should sign a message with provide private key', async () => {
      await expect(
        createSignature({
          messageRaw: 'message',
          privateKey: { armoredKey: pgpPrivateKey, passphrase: passphrase },
        }),
      ).resolves.not.toThrowError();
    });
  });

  describe('validatePrivateKey()', () => {
    it('should not throw an error for armored key with begin and end block', async () => {
      const armoredKey = `-----BEGIN PGP PRIVATE KEY BLOCK-----\n\nabcdef-----END PGP PRIVATE KEY BLOCK-----`;
      expect(() => validatePrivateKey({ armoredKey })).not.toThrowError();
    });

    it('should throw an error for armored key without begin block', async () => {
      const armoredKey = `abcdef-----END PGP PRIVATE KEY BLOCK-----`;
      expect(() => validatePrivateKey({ armoredKey })).toThrowError(
        new PgpPrivateKeyValidationError('missing BEGIN PGP PRIVATE KEY BLOCK'),
      );
    });

    it('should throw an error for armored key without end block', async () => {
      const armoredKey = `-----BEGIN PGP PRIVATE KEY BLOCK-----\n\nabcdef`;
      expect(() => validatePrivateKey({ armoredKey })).toThrowError(
        new PgpPrivateKeyValidationError('missing END PGP PRIVATE KEY BLOCK'),
      );
    });
  });
});
