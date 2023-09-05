import { log as logger } from '../../logs/logger';
import {
  convertBodyToGitHubCommitPayload,
  isGitHubCreateCommitEndpoint,
  stringifyGitHubCommitPayload,
} from './github/commit';
import {
  convertBodyToGitHubTreePayload,
  isGitHubCreateTreeEndpoint,
  validateForSymlinksInCreateTree,
} from './github/tree';
import { createSignature, normalizeArmoredKeyIfNeeded } from './pgp/sign';
import { getCommitSigningGitHubFilterRules } from './github/commit-signing-filter-rules';
import type { Config } from '../config';
import type { FilterRule } from './types';

export function gitHubCommitSigningEnabled(
  config: any,
  options: { method: string; url: string },
): boolean {
  return (
    commitSigningEnabled(config as Config) &&
    isGitHubCreateCommitEndpoint(options)
  );
}

export function gitHubTreeCheckNeeded(
  config: any,
  options: {
    method: string;
    url: string;
  },
): boolean {
  return (
    commitSigningEnabled(config as Config) &&
    isGitHubCreateTreeEndpoint(options)
  );
}

export const commitSigningEnabled = (
  config: Config | Record<string, any>,
): boolean => {
  let gpgPassphraseConfigured = false;
  if (
    typeof config.GPG_PASSPHRASE !== 'undefined' &&
    config.GPG_PASSPHRASE !== ''
  ) {
    gpgPassphraseConfigured = true;
  }

  let gpgPrivateKeyConfigured = false;
  if (
    typeof config.GPG_PRIVATE_KEY !== 'undefined' &&
    config.GPG_PRIVATE_KEY !== ''
  ) {
    gpgPrivateKeyConfigured = true;
  }

  let gitCommitterNameConfigured = false;
  if (
    typeof config.GIT_COMMITTER_NAME !== 'undefined' &&
    config.GIT_COMMITTER_NAME !== ''
  ) {
    gitCommitterNameConfigured = true;
  }

  let gitCommitterEmailConfigured = false;
  if (
    typeof config.GIT_COMMITTER_EMAIL !== 'undefined' &&
    config.GIT_COMMITTER_EMAIL !== ''
  ) {
    gitCommitterEmailConfigured = true;
  }

  return (
    gpgPassphraseConfigured &&
    gpgPrivateKeyConfigured &&
    gitCommitterNameConfigured &&
    gitCommitterEmailConfigured
  );
};

export function commitSigningFilterRules(): FilterRule[] {
  return getCommitSigningGitHubFilterRules();
}

/**
 * Sign GitHub commit with PGP private key and set `signature` property
 * for the GitHub commit payload.
 */
export async function signGitHubCommit(
  config: any,
  body: unknown,
): Promise<string> {
  const bodyAsString = convertBodyToStringIfNeeded(body);
  const commit = convertBodyToGitHubCommitPayload(bodyAsString, {
    committerName: (config as Config).GIT_COMMITTER_NAME,
    committerEmail: (config as Config).GIT_COMMITTER_EMAIL,
  });
  logger.debug({ commit }, 'github commit payload');

  const messageRaw = stringifyGitHubCommitPayload(commit);
  logger.debug({ messageRaw }, 'raw message before creating pgp signature');

  const armoredKey = normalizeArmoredKeyIfNeeded(
    (config as Config).GPG_PRIVATE_KEY,
  );
  const signature = await createSignature({
    messageRaw: messageRaw,
    privateKey: {
      armoredKey,
      passphrase: (config as Config).GPG_PASSPHRASE,
    },
  });
  logger.debug({ signature }, 'commit pgp signature');

  commit.signature = signature;

  return Promise.resolve(JSON.stringify(commit));
}

/**
 * Validates GitHub tree object and throw an error if the payload contains symlinks.
 */
export function validateGitHubTreePayload(body: unknown): void {
  const bodyAsString = convertBodyToStringIfNeeded(body);
  const tree = convertBodyToGitHubTreePayload(bodyAsString);
  logger.debug({ tree }, 'github tree payload');

  validateForSymlinksInCreateTree(tree);
}

const convertBodyToStringIfNeeded = (body: unknown): string => {
  if (isUint8Array(body)) {
    return Buffer.from(body).toString();
  } else if (typeof body === 'string' || body instanceof String) {
    return body as string;
  } else {
    throw new Error('body must be string or Uint8Array');
  }
};

const isUint8Array = (data: unknown): data is Uint8Array => {
  return !!(data && data instanceof Uint8Array);
};
