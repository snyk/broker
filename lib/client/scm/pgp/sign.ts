import * as openpgp from 'openpgp';
import { PgpPrivateKeyValidationError } from './errors';
import type { CreateSignatureOptions, PgpPrivateKey } from './types';

const pgpPrivateKeyBeginBlock = '-----BEGIN PGP PRIVATE KEY BLOCK-----\n';
const pgpPrivateKeyEndBlock = '-----END PGP PRIVATE KEY BLOCK-----';

export async function createSignature(
  options: CreateSignatureOptions,
): Promise<string> {
  validatePrivateKey(options.privateKey);

  const privateKey = await openpgp.decryptKey({
    privateKey: await openpgp.readPrivateKey({
      armoredKey: options.privateKey.armoredKey,
    }),
    passphrase: options.privateKey.passphrase,
  });

  const message = await openpgp.createMessage({ text: options.messageRaw });

  const detachedSignature = await openpgp.sign({
    message,
    signingKeys: privateKey,
    detached: true,
  });

  return Promise.resolve(detachedSignature.replace(/\r\n/g, '\n').trim());
}

export function validatePrivateKey(pgpPrivateKey: PgpPrivateKey): void {
  const armoredKey = pgpPrivateKey.armoredKey.trim();
  if (!armoredKey.startsWith(pgpPrivateKeyBeginBlock)) {
    throw new PgpPrivateKeyValidationError(
      'missing BEGIN PGP PRIVATE KEY BLOCK',
    );
  }
  if (!armoredKey.endsWith(pgpPrivateKeyEndBlock)) {
    throw new PgpPrivateKeyValidationError('missing END PGP PRIVATE KEY BLOCK');
  }
}

export function normalizeArmoredKeyIfNeeded(armoredKey: string): string {
  // passing env vars for Docker containers appends additional backslash
  // for already escaped values (e.g. will be \n -> \\n), this leads to
  // "misformed armor key" error from openpgp library
  return armoredKey.replace(/\\n/g, '\n');
}
