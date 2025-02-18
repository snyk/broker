import type { FilterRule } from '../types';

export function getCommitSigningGitHubFilterRules(): FilterRule[] {
  const origin = 'https://${GITHUB_TOKEN}@${GITHUB_API}';

  return [
    {
      '//': 'create tree',
      method: 'POST',
      path: '/repos/:name/:repo/git/trees',
      origin,
    },
    {
      '//': 'create tree refs',
      method: 'POST',
      path: '/repos/:name/:repo/git/trees/:ref',
      origin,
    },
    {
      '//': 'create commit',
      method: 'POST',
      path: '/repos/:name/:repo/git/commits',
      origin,
    },
    {
      '//': 'update pull request',
      method: 'PATCH',
      path: '/repos/:name/:repo/pulls/:pull_number',
      origin,
    },
    {
      '//': 'delete ref head',
      method: 'DELETE',
      path: '/repos/:name/:repo/git/refs/heads/:branch_name',
      origin,
    },
  ];
}
