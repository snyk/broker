import {
  convertBodyToGitHubCommitPayload,
  isGitHubCreateCommitEndpoint,
  stringifyGitHubCommitPayload,
} from '../../../../../lib/hybrid-sdk/client/scm/github/commit';
import type { GitHubCommitPayload } from '../../../../../lib/hybrid-sdk/client/scm/github/types';

describe('client/scm/github/commit.ts', () => {
  describe('isGitHubCreateCommitEndpoint()', () => {
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
          isGitHubCreateCommitEndpoint({ method: httpMethod, url: 'some-url' }),
        ).toEqual(false);
      },
    );

    it('should return false for POST method and not create-commit endpoint', async () => {
      expect(
        isGitHubCreateCommitEndpoint({
          method: 'POST',
          url: 'non-create-commit-endpoint',
        }),
      ).toEqual(false);
    });

    it('should return true for POST method and create-commit endpoint', async () => {
      expect(
        isGitHubCreateCommitEndpoint({
          method: 'POST',
          url: 'https://api.github.com/owner/repo/git/commits',
        }),
      ).toEqual(true);
    });
  });

  describe('convertBodyToGitHubCommitPayload()', () => {
    it('should convert to github commit payload when body is correct', async () => {
      const body = `{
"message": "fix: package.json & package-lock.json",
"tree": "1111111111111111111111111111111111111111",
"parents": [
  "0000000000000000000000000000000000000000"
],
"author": {
  "name": "broker-test-user",
  "email": "broker-test-user@example.com",
  "date": "2023-05-06T08:08:08.888Z"
},
"committer": {
  "name": "broker-test-user",
  "email": "broker-test-user@example.com",
  "date": "2023-05-06T08:08:08.888Z"
}
}`;
      const commitPayload = convertBodyToGitHubCommitPayload(body, {
        committerName: 'broker-test-user',
        committerEmail: 'broker-test-user@example.com',
      });

      expect(commitPayload).toStrictEqual({
        message: 'fix: package.json & package-lock.json',
        tree: '1111111111111111111111111111111111111111',
        parents: ['0000000000000000000000000000000000000000'],
        author: {
          name: 'broker-test-user',
          email: 'broker-test-user@example.com',
          date: new Date('2023-05-06T08:08:08.888Z'),
        },
        committer: {
          name: 'broker-test-user',
          email: 'broker-test-user@example.com',
          date: new Date('2023-05-06T08:08:08.888Z'),
        },
      });
    });
  });

  describe('stringifyGitHubCommitPayload()', () => {
    beforeAll(() => {
      jest.useFakeTimers().setSystemTime(new Date('2023-01-01T00:00:00Z'));
    });
    afterAll(() => {
      jest.useRealTimers();
    });

    it('should convert to git commit format', async () => {
      const commit = {
        message: 'commit message',
        tree: '1111',
        parents: ['0000'],
        author: {
          name: 'test-author',
          email: 'test-author@example.com',
          date: new Date(),
        },
        committer: {
          name: 'test-committer',
          email: 'test-committer@example.com',
          date: new Date(),
        },
      } as GitHubCommitPayload;

      const stringifiedCommit = stringifyGitHubCommitPayload(commit);

      expect(stringifiedCommit).toEqual(`tree 1111
parent 0000
author test-author <test-author@example.com> 1672531200 +0000
committer test-committer <test-committer@example.com> 1672531200 +0000

commit message`);
    });
  });
});
