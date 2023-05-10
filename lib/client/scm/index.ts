import * as logger from '../../log';
import {
  convertBodyToGitHubCommitPayload,
  isGitHubCreateCommitEndpoint,
  stringifyGitHubCommitPayload,
} from './github/commit';
import { createSignature } from './pgp/sign';
import { getCommitSigningGitHubFilterRules } from './github/commit-signing-filter-rules';
import type { Config } from '../config';
import type { FilterRule } from './types';

export function githubCommitSigningEnabled(
  config: any,
  options: { method: string; url: string },
): boolean {
  return (
    commitSigningEnabled(config as Config) &&
    isGitHubCreateCommitEndpoint(options)
  );
}

export const commitSigningEnabled = (config: Config): boolean => {
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
  const commit = convertBodyToGitHubCommitPayload(body, {
    committerName: (config as Config).GIT_COMMITTER_NAME,
    committerEmail: (config as Config).GIT_COMMITTER_EMAIL,
  });
  logger.debug({ commit }, 'github commit payload');

  const messageRaw = stringifyGitHubCommitPayload(commit);
  logger.debug({ messageRaw }, 'raw message before creating pgp signature');
  const signature = await createSignature({
    messageRaw: messageRaw,
    privateKey: {
      armoredKey: (config as Config).GPG_PRIVATE_KEY,
      passphrase: (config as Config).GPG_PASSPHRASE,
    },
  });
  logger.debug({ signature }, 'commit pgp signature');

  commit.signature = signature;

  return Promise.resolve(JSON.stringify(commit));
}
