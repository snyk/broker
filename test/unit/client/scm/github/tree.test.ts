import {
  convertBodyToGitHubTreePayload,
  isGitHubCreateTreeEndpoint,
  validateForSymlinksInCreateTree,
} from '../../../../../lib/client/scm/github/tree';
import type { GitHubCreateTreePayload } from '../../../../../lib/client/scm/github/types';
import { GitHubTreeValidationError } from '../../../../../lib/client/scm/github/errors';

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
      "type":"commit",
      "mode":"100644"
    },
    {
      "path":"package-lock.json",
      "content":"bla-bla-bla-lock",
      "type":"commit",
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
            type: 'commit',
            mode: '100644',
          },
          {
            path: 'package-lock.json',
            content: 'bla-bla-bla-lock',
            type: 'commit',
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
            type: 'commit',
            mode: '120000',
          },
          {
            path: 'bbb.txt',
            content: 'content',
            type: 'commit',
            mode: '100644',
          },
          {
            path: 'ccc.txt',
            content: 'content',
            type: 'commit',
            mode: '120000',
          },
        ],
      } satisfies GitHubCreateTreePayload;

      expect(() => validateForSymlinksInCreateTree(createTree)).toThrowError(
        GitHubTreeValidationError,
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
            type: 'commit',
            mode: '100644',
          },
          {
            path: 'bbb.txt',
            content: 'content',
            type: 'commit',
            mode: '100755',
          },
        ],
      } satisfies GitHubCreateTreePayload;

      expect(() =>
        validateForSymlinksInCreateTree(createTree),
      ).not.toThrowError(GitHubTreeValidationError);
    });
  });
});
