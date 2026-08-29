import {
  convertBodyToGitHubTreePayload,
  isGitHubCreateTreeEndpoint,
  validateForSymlinksInCreateTree,
} from '../../../../../lib/hybrid-sdk/client/scm/github/tree';
import type { GitHubCreateTreePayload } from '../../../../../lib/hybrid-sdk/client/scm/github/types';
import { GitHubTreeValidationError } from '../../../../../lib/hybrid-sdk/client/scm/github/errors';

describe('client/scm/github/tree.ts', () => {
  describe('isGitHubCreateTreeEndpoint()', () => {
    const httpMethods = [
      ['GET'],
      ['HEAD'],
      ['PUT'],
      ['DELETE'],
      ['CONNECT'],
      ['OPTIONS'],
      ['TRACE'],
      ['PATCH'],
    ];
    it.each(httpMethods)(
      'should return false for %s http method',
      async (httpMethod) => {
        expect(
          isGitHubCreateTreeEndpoint({ method: httpMethod, url: 'some-url' }),
        ).toEqual(false);
      },
    );

    it('should return false for POST method and not create-tree endpoint', async () => {
      expect(
        isGitHubCreateTreeEndpoint({
          method: 'POST',
          url: 'non-create-tree-endpoint',
        }),
      ).toEqual(false);
    });

    it('should return true for POST method and create-tree endpoint', async () => {
      expect(
        isGitHubCreateTreeEndpoint({
          method: 'POST',
          url: 'https://api.github.com/owner/repo/git/trees',
        }),
      ).toEqual(true);
    });
  });

  describe('convertBodyToGitHubTreePayload()', () => {
    it('should convert to github tree payload when body is correct ', async () => {
      const body = `{
  "owner": "owner",
  "repo": "repo",
  "base_tree": "0000000000000000000000000000000000000000",
  "tree": [
    {
      "path": "package.json",
      "content":"bla-bla-bla",
      "type":"blob",
      "mode":"100644"
    },
    {
      "path":"package-lock.json",
      "content":"bla-bla-bla-lock",
      "type":"blob",
      "mode":"100644"
    }
  ]
}
`;
      const treePayload = convertBodyToGitHubTreePayload(body);

      expect(treePayload).toStrictEqual({
        owner: 'owner',
        repo: 'repo',
        tree: [
          {
            path: 'package.json',
            content: 'bla-bla-bla',
            type: 'blob',
            mode: '100644',
          },
          {
            path: 'package-lock.json',
            content: 'bla-bla-bla-lock',
            type: 'blob',
            mode: '100644',
          },
        ],
        base_tree: '0000000000000000000000000000000000000000',
      });
    });
  });

  describe('validateForSymlinksInCreateTree()', () => {
    it('should throw a validation error when tree contains symlinks', async () => {
      const createTree = {
        owner: 'owner',
        repo: 'repo',
        base_tree: '0000000000000000000000000000000000000000',
        tree: [
          {
            path: 'aaa.txt',
            content: 'content',
            type: 'blob',
            mode: '120000',
          },
          {
            path: 'bbb.txt',
            content: 'content',
            type: 'blob',
            mode: '100644',
          },
          {
            path: 'ccc.txt',
            content: 'content',
            type: 'blob',
            mode: '120000',
          },
        ],
      } satisfies GitHubCreateTreePayload;

      expect(() => validateForSymlinksInCreateTree(createTree)).toThrowError(
        GitHubTreeValidationError,
      );
      expect(() => validateForSymlinksInCreateTree(createTree)).toThrowError(
        'Symlinks are not allowed in GitHub tree payload: aaa.txt, ccc.txt',
      );
    });

    it('should not throw a validation error when tree has no symlinks', async () => {
      const createTree = {
        owner: 'owner',
        repo: 'repo',
        base_tree: '0000000000000000000000000000000000000000',
        tree: [
          {
            path: 'aaa.txt',
            content: 'content',
            type: 'blob',
            mode: '100644',
          },
          {
            path: 'bbb.txt',
            content: 'content',
            type: 'blob',
            mode: '100755',
          },
          {
            path: 'nested',
            sha: '1111111111111111111111111111111111111111',
            type: 'tree',
            mode: '040000',
          },
          {
            path: 'vendor/dependency',
            sha: '2222222222222222222222222222222222222222',
            type: 'commit',
            mode: '160000',
          },
        ],
      } satisfies GitHubCreateTreePayload;

      expect(() =>
        validateForSymlinksInCreateTree(createTree),
      ).not.toThrowError(GitHubTreeValidationError);
    });

    it('should allow deleting an existing symlink', () => {
      const createTree = {
        owner: 'owner',
        repo: 'repo',
        base_tree: '0000000000000000000000000000000000000000',
        tree: [
          {
            path: 'obsolete-link',
            sha: null,
            type: 'blob',
            mode: '120000',
          },
        ],
      } satisfies GitHubCreateTreePayload;

      expect(() =>
        validateForSymlinksInCreateTree(createTree),
      ).not.toThrowError(GitHubTreeValidationError);
    });

    it('should reject a symlink with both null sha and content', () => {
      const createTree = {
        owner: 'owner',
        repo: 'repo',
        base_tree: '0000000000000000000000000000000000000000',
        tree: [
          {
            path: 'ambiguous-link',
            sha: null,
            content: '/etc/passwd',
            type: 'blob',
            mode: '120000',
          },
        ],
      } satisfies GitHubCreateTreePayload;

      expect(() => validateForSymlinksInCreateTree(createTree)).toThrowError(
        'Symlinks are not allowed in GitHub tree payload: ambiguous-link',
      );
    });
  });
});
