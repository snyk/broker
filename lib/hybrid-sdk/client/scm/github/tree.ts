import { log as logger } from '../../../../logs/logger';
import { GitHubTreeParsingError, GitHubTreeValidationError } from './errors';
import type { GitHubTree, GitHubCreateTreePayload } from './types';

export function isGitHubCreateTreeEndpoint(options: {
  method: string;
  url: string;
}): boolean {
  // https://docs.github.com/en/rest/git/trees?apiVersion=2022-11-28#create-a-tree
  return options.method === 'POST' && options.url.includes('/git/trees');
}

export function convertBodyToGitHubTreePayload(
  body: string,
): GitHubCreateTreePayload {
  try {
    const bodyAsJson = JSON.parse(body);
    return {
      owner: bodyAsJson.owner,
      repo: bodyAsJson.repo,
      base_tree: bodyAsJson.base_tree,
      tree: bodyAsJson.tree as GitHubTree[],
    } satisfies GitHubCreateTreePayload;
  } catch (error) {
    logger.error({ error }, 'Could not parse GitHub create tree payload body');
    throw new GitHubTreeParsingError(
      'Could not parse GitHub create tree payload body',
    );
  }
}

export function validateForSymlinksInCreateTree(
  createTree: GitHubCreateTreePayload,
): void {
  const treesWithSymlink = createTree.tree.filter((tree) => {
    // GitHub uses sha: null without content to delete an existing entry.
    // Removing a symlink is safe; any entry that could create one is not.
    const isDeletion = tree.sha === null && tree.content === undefined;
    return tree.mode === '120000' && !isDeletion;
  });

  if (treesWithSymlink.length > 0) {
    const paths = treesWithSymlink.map((tree) => tree.path).join(', ');
    throw new GitHubTreeValidationError(
      `Symlinks are not allowed in GitHub tree payload: ${paths}`,
    );
  }
}
