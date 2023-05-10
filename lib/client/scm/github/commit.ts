import * as logger from '../../../log';
import { GitHubCommitParsingError } from './errors';
import type { GitHubCommitPayload, GitUser } from './types';

export function isGitHubCreateCommitEndpoint(options: {
  method: string;
  url: string;
}): boolean {
  // https://docs.github.com/en/rest/git/commits?apiVersion=2022-11-28#create-a-commit
  return options.method === 'POST' && options.url.includes('/git/commits');
}

export function convertBodyToGitHubCommitPayload(
  body: unknown,
  options: {
    committerName: string;
    committerEmail: string;
  },
): GitHubCommitPayload {
  const bodyAsString = convertBodyToStringIfNeeded(body);

  try {
    const bodyAsJson = JSON.parse(bodyAsString);
    return {
      message: bodyAsJson.message,
      tree: bodyAsJson.tree,
      parents: bodyAsJson.parents as [],
      author: {
        name: bodyAsJson.author.name,
        email: bodyAsJson.author.email,
        date: convertToDate(bodyAsJson.author.date),
      },
      committer: {
        name: options.committerName,
        email: options.committerEmail,
        date: convertToDate(bodyAsJson.committer?.date || new Date()),
      },
    } satisfies GitHubCommitPayload;
  } catch (error) {
    logger.error({ error }, 'Could not parse GitHub commit payload body');
    throw new GitHubCommitParsingError(
      'Could not parse GitHub commit payload body',
    );
  }
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

const convertToDate = (input: unknown): Date => {
  if (input && typeof input === 'string') {
    return new Date(input);
  } else if (input && input instanceof Date) {
    return input;
  } else {
    throw new Error('could not convert input to date');
  }
};

export function stringifyGitHubCommitPayload(
  commit: GitHubCommitPayload,
): string {
  return `tree ${commit.tree}
parent ${commit.parents[0]}
author ${stringifyGitUser(commit.author)}
committer ${stringifyGitUser(commit.committer)}

${commit.message}`.trim();
}

const stringifyGitUser = (user: GitUser): string => {
  const timestamp = Math.floor(user.date.getTime() / 1000);
  return `${user.name} <${user.email}> ${timestamp} +0000`;
};
