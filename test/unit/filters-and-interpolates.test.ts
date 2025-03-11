import { readFileSync } from 'fs';
import path from 'path';

import { loadFilters } from '../../lib/hybrid-sdk/common/filter/filtersAsync';
import { Rule } from '../../lib/hybrid-sdk/common/types/filter';
import { getInterpolatedRequest } from '../../lib/hybrid-sdk/interpolateRequestWithConfigData';

const jsonBuffer = (body) => Buffer.from(JSON.stringify(body));

function loadFixture(name: string) {
  const fixturePath = path.join(__dirname, '..', 'fixtures', name);
  const fixture = readFileSync(fixturePath, { encoding: 'utf-8' });

  return fixture;
}

function loadDefaultFilter(name: string) {
  const filterPath = path.join(__dirname, '../../', 'defaultFilters', name);
  const filter = readFileSync(filterPath, { encoding: 'utf-8' });

  return filter;
}

describe('filters and interpolates', () => {
  describe('on URL', () => {
    describe('for GitHub private filters', () => {
      const rules = JSON.parse(loadFixture(path.join('accept', 'github.json')));
      const filter = loadFilters(rules.private, 'default', {});

      it('should allow valid /repos path to manifest', () => {
        const url = '/repos/angular/angular/contents/package.json';

        const filterResponse = filter({
          url,
          method: 'GET',
        });
        expect(filterResponse).not.toEqual(false);
        expect(filterResponse).toStrictEqual({
          '//': 'used to determine the full dependency tree',
          method: 'GET',
          path: '/repos/:name/:repo/contents/:path*/package.json',
          origin: 'https://${GITHUB_TOKEN}@${GITHUB_API}',
          connectionType: 'default',
        });
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url,
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch(url);
      });

      it('should block when manifest appears after fragment identifier', () => {
        const filterResponse = filter({
          url: '/repos/angular/angular/contents/test-main.js#/package.json',
          method: 'GET',
        });
        expect(filterResponse).toBeFalsy();
      });

      it('should block when path includes directory traversal', () => {
        const filterResponse = filter({
          url: '/repos/angular/angular/contents/path/to/docs/../../sensitive/file.js',
          method: 'GET',
        });
        expect(filterResponse).toBeFalsy();
      });

      it('should allow creating a general pull request comment', () => {
        const url = '/repos/test-org/test-repo/issues/1/comments';

        const filterResponse = filter({
          url,
          method: 'POST',
        });
        expect(filterResponse).not.toEqual(false);
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url,
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch(url);
      });

      it('should allow updating a general pull request comment', () => {
        const url = '/repos/test-org/test-repo/issues/comments/12345';

        const filterResponse = filter({
          url,
          method: 'PATCH',
        });
        expect(filterResponse).not.toEqual(false);
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url,
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch(url);
      });

      it('should allow creating a pull request review', () => {
        const url = '/repos/test-org/test-repo/pulls/:pullRef/reviews';

        const filterResponse = filter({
          url,
          method: 'POST',
        });
        expect(filterResponse).not.toEqual(false);
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url,
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch(url);
      });

      it('should allow updating webhook config', () => {
        const url = '/repos/test-org/test-repo/hooks/12345/config';

        const filterResponse = filter({
          url,
          method: 'PATCH',
        });

        expect(filterResponse).not.toEqual(false);
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url,
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch(url);
      });
    });

    describe('for bitbucket server private filters', () => {
      const rules = JSON.parse(loadDefaultFilter('bitbucket-server.json'));
      const filter = loadFilters(rules.private, 'default', {});

      it('should allow creating a general pull request comment', () => {
        const url =
          '/projects/test-org/repos/test-repo/pull-requests/1/comments';

        const filterResponse = filter({
          url,
          method: 'POST',
        });
        expect(filterResponse).not.toEqual(false);
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url,
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch(url);
      });

      it('should allow updating a general pull request comment', () => {
        const url =
          '/projects/test-org/repos/test-repo/pull-requests/1/comments/12345';

        const filterResponse = filter({
          url,
          method: 'PUT',
        });
        expect(filterResponse).not.toEqual(false);
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url,
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch(url);
      });

      it('should allow getting a general pull request comment', () => {
        const url =
          '/projects/test-org/repos/test-repo/pull-requests/1/comments/12345';

        const filterResponse = filter({
          url,
          method: 'GET',
        });
        expect(filterResponse).not.toEqual(false);
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url,
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch(url);
      });

      it('should allow creating an inline pull request comment', () => {
        const url =
          '/projects/test-org/repos/test-repo/pull-requests/1/inline-comments';

        const filterResponse = filter({
          url,
          method: 'POST',
        });
        expect(filterResponse).not.toEqual(false);
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url,
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch(url);
      });

      it('should allow resolving a pull request comment', () => {
        const url =
          '/projects/test-org/repos/test-repo/pull-requests/1/comments/12345/resolve';

        const filterResponse = filter({
          url,
          method: 'POST',
        });
        expect(filterResponse).not.toEqual(false);
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url,
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch(url);
      });

      it('should allow searching permissions', () => {
        const url =
          '/rest/api/1.0/projects/:project/repos/:repo/permissions/search';

        const filterResponse = filter({
          url,
          method: 'GET',
        });
        expect(filterResponse).not.toEqual(false);
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url,
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch(url);
      });

      it('should allow fetching single PR info', () => {
        const url =
          '/rest/api/1.0/projects/test-org/repos/test-repo/pull-requests/1';

        const filterResponse = filter({
          url,
          method: 'GET',
        });
        expect(filterResponse).not.toEqual(false);
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url,
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch(url);
      });
    });

    describe('for bitbucket server bearer auth private filters', () => {
      const rules = JSON.parse(
        loadDefaultFilter('bitbucket-server-bearer-auth.json'),
      );
      const filter = loadFilters(rules.private, 'default', {});

      it('should allow creating a general pull request comment', () => {
        const url =
          '/projects/test-org/repos/test-repo/pull-requests/1/comments';

        const filterResponse = filter({
          url,
          method: 'POST',
        });
        expect(filterResponse).not.toEqual(false);
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url,
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch(url);
      });

      it('should allow updating a general pull request comment', () => {
        const url =
          '/projects/test-org/repos/test-repo/pull-requests/1/comments/12345';

        const filterResponse = filter({
          url,
          method: 'PUT',
        });
        expect(filterResponse).not.toEqual(false);
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url,
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch(url);
      });

      it('should allow getting a general pull request comment', () => {
        const url =
          '/projects/test-org/repos/test-repo/pull-requests/1/comments/12345';

        const filterResponse = filter({
          url,
          method: 'GET',
        });
        expect(filterResponse).not.toEqual(false);
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url,
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch(url);
      });

      it('should allow creating an inline pull request comment', () => {
        const url =
          '/projects/test-org/repos/test-repo/pull-requests/1/inline-comments';

        const filterResponse = filter({
          url,
          method: 'POST',
        });
        expect(filterResponse).not.toEqual(false);
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url,
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch(url);
      });

      it('should allow resolving a pull request comment', () => {
        const url =
          '/projects/test-org/repos/test-repo/pull-requests/1/comments/12345/resolve';

        const filterResponse = filter({
          url,
          method: 'POST',
        });
        expect(filterResponse).not.toEqual(false);
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url,
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch(url);
      });

      it('should allow searching permissions', () => {
        const url =
          '/rest/api/1.0/projects/:project/repos/:repo/permissions/search';

        const filterResponse = filter({
          url,
          method: 'GET',
        });
        expect(filterResponse).not.toEqual(false);
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url,
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch(url);
      });

      it('should allow fetching pr info', () => {
        const url =
          '/rest/api/1.0/projects/test-org/repos/test-repo/pull-requests/1';

        const filterResponse = filter({
          url,
          method: 'GET',
        });
        expect(filterResponse).not.toEqual(false);
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url,
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch(url);
      });

      it('should allow fetching webook info', () => {
        const url =
          '/rest/api/1.0/projects/:project/repos/:repo/webhooks/:webhookId';

        const filterResponse = filter({
          url,
          method: 'GET',
        });
        expect(filterResponse).not.toEqual(false);
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url,
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch(url);
      });

      it('should allow updating webhook config', () => {
        const url =
          '/rest/api/1.0/projects/:project/repos/:repo/webhooks/:webhookId';

        const filterResponse = filter({
          url,
          method: 'PUT',
        });

        expect(filterResponse).not.toEqual(false);
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url,
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch(url);
      });
    });

    describe('for azure repos', () => {
      const rules = JSON.parse(loadDefaultFilter('azure-repos.json'));
      const filter = loadFilters(rules.private, 'default', {});

      it('should allow evaluating permissions', () => {
        const url = '/_apis/security/permissionevaluationbatch';

        const filterResponse = filter({
          url,
          method: 'POST',
        });
        expect(filterResponse).not.toEqual(false);
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url,
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch(url);
      });

      it('should allow listing fixtures', () => {
        const url =
          '/test-owner/_apis/git/repositories/test-repo/pullRequests/1/iterations';

        const filterResponse = filter({
          url,
          method: 'GET',
        });

        expect(filterResponse).not.toEqual(false);
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url,
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch(url);
      });

      it('should allow fetching single pr info', () => {
        const url =
          '/test-owner/_apis/git/repositories/test-repo/pullRequests/1';

        const filterResponse = filter({
          url,
          method: 'GET',
        });

        expect(filterResponse).not.toEqual(false);
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url,
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch(url);
      });

      it('should allow fetching pr info with api-version', () => {
        const url =
          '/test-owner/_apis/git/repositories/test-repo/pullrequests/1?api-version=7.1';

        const filterResponse = filter({
          url,
          method: 'GET',
        });

        expect(filterResponse).not.toEqual(false);
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url,
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch(url);
      });

      it('should allow updating webhooks', () => {
        const url =
          '/_apis/hooks/subscriptions/fb17310a-983e-5851-a4cd-6381e14a4da4';

        const filterResponse = filter({
          url,
          method: 'PUT',
        });

        expect(filterResponse).not.toEqual(false);
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url,
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch(url);
      });

      it('should allow creating a pull request comment (general or inline)', () => {
        const url = '/_apis/git/repositories/test-repo/pullRequests/1/threads';

        const filterResponse = filter({
          url,
          method: 'POST',
        });
        expect(filterResponse).not.toEqual(false);
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url,
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch(url);
      });

      it('should allow updating/resolving a pull request comment (general or inline)', () => {
        const url =
          '/_apis/git/repositories/test-repo/pullRequests/1/threads/1/comments/1';

        const filterResponse = filter({
          url,
          method: 'PATCH',
        });
        expect(filterResponse).not.toEqual(false);
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url,
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch(url);
      });
    });

    describe('for gitlab', () => {
      const rules = JSON.parse(loadDefaultFilter('gitlab.json'));
      const filter = loadFilters(rules.private, 'default', {});

      it('should allow getting self token', () => {
        const url = '/api/v4/personal_access_tokens/self';

        const filterResponse = filter({
          url,
          method: 'GET',
        });
        expect(filterResponse).not.toEqual(false);
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url,
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch(url);
      });

      it('should allow fetching PR info', () => {
        const url = '/api/v4/projects/test-project/merge_requests/1';

        const filterResponse = filter({
          url,
          method: 'GET',
        });
        expect(filterResponse).not.toEqual(false);
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url,
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch(url);
      });

      it('should allow fetching webhook info', () => {
        const url = '/api/v4/projects/test-project/hooks/1';

        const filterResponse = filter({
          url,
          method: 'GET',
        });
        expect(filterResponse).not.toEqual(false);
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url,
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch(url);
      });

      it('should allow updating webhook info', () => {
        const url = '/api/v4/projects/test-project/hooks/1';

        const filterResponse = filter({
          url,
          method: 'PUT',
        });
        expect(filterResponse).not.toEqual(false);
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url,
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch(url);
      });
      it('should allow creating a summary merge request comment', () => {
        const url = '/api/v4/projects/123/merge_requests/1/notes';

        const filterResponse = filter({
          url,
          method: 'POST',
        });
        expect(filterResponse).not.toEqual(false);
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url,
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch(url);
      });

      it('should allow updating a general pull request comment', () => {
        const url = '/api/v4/projects/123/merge_requests/1/notes/12345';

        const filterResponse = filter({
          url,
          method: 'PUT',
        });
        expect(filterResponse).not.toEqual(false);
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url,
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch(url);
      });

      it('should allow retrieving diff version for a given commit SHA', () => {
        const url = '/api/v4/projects/123/merge_requests/1/versions';

        const filterResponse = filter({
          url,
          method: 'GET',
        });
        expect(filterResponse).not.toEqual(false);
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url,
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch(url);
      });

      it('should allow creating an inline comment', () => {
        const url = '/api/v4/projects/123/merge_requests/1/discussions';

        const filterResponse = filter({
          url,
          method: 'POST',
        });
        expect(filterResponse).not.toEqual(false);
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url,
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch(url);
      });

      it('should allow resolving an inline comment', () => {
        const url =
          '/api/v4/projects/123/merge_requests/1/discussions/abcd1234';

        const filterResponse = filter({
          url,
          method: 'PUT',
        });
        expect(filterResponse).not.toEqual(false);
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url,
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch(url);
      });
    });
  });

  describe('on body', () => {
    const rules = JSON.parse(loadFixture('relay.json'));
    const filter = loadFilters(rules);

    it('allows requests that match', () => {
      const filterResponse = filter({
        url: '/',
        method: 'POST',
        body: jsonBuffer({
          commits: [
            {
              modified: ['package.json', 'file1.txt'],
            },
          ],
        }),
      });
      const filterResponseAsRule = filterResponse as Rule;
      const result = getInterpolatedRequest(
        null,
        filterResponseAsRule,
        {
          url: '/',
          method: 'GET',
        },
        {},
        {},
      );
      expect(result.url).toMatch('/');
    });

    it('allows requests with partial matches across multiple commits', () => {
      const filterResponse = filter({
        url: '/',
        method: 'POST',
        body: jsonBuffer({
          commits: [
            {
              modified: ['file2.txt'],
            },
            {
              modified: ['.snyk', 'file1.txt'],
            },
          ],
        }),
      });
      const filterResponseAsRule = filterResponse as Rule;
      const result = getInterpolatedRequest(
        null,
        filterResponseAsRule,
        {
          url: '/',
          method: 'GET',
        },
        {},
        {},
      );
      expect(result.url).toMatch('/');
    });

    it('blocks files if not explicitly allowed by filter rules', () => {
      const filterResponse = filter({
        url: '/',
        method: 'POST',
        body: jsonBuffer({
          commits: [
            {
              modified: ['file2.txt'],
            },
            {
              modified: ['file3.txt', 'file1.txt'],
            },
          ],
        }),
      });
      expect(filterResponse).toBeFalsy();
    });

    it('blocks requests with no valid items', () => {
      const filterResponse = filter({
        url: '/',
        method: 'POST',
        body: jsonBuffer({
          commits: [],
        }),
      });
      expect(filterResponse).toBeFalsy();
    });

    describe('graphql', () => {
      it('find globs - valid query', () => {
        const filterResponse = filter({
          url: '/graphql',
          method: 'POST',
          body: jsonBuffer({
            query: `{
        repositoryOwner(login: "_REPO_OWNER_") {
          repository(name: "_REPO-NAME_") {
            object(expression: "_BRANCH_/_NAME_") {
              ... on Tree {
                entries {
                  name
                  type
                  object {
                    ... on Tree {
                      entries {
                        name
                        type
                        object {
                          ... on Tree {
                            entries {
                              name
                              type
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }`,
          }),
        });
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url: '/graphql',
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch('/graphql');
      });

      it('find globs - noSQL injection', () => {
        const filterResponse = filter({
          url: '/graphql',
          method: 'POST',
          body: jsonBuffer({
            /* eslint-disable no-useless-escape */
            query: `{
              repositoryOwner(login: "search: "{\"username\": {\"$regex\": \"sue\"}, \"email\": {\"$regex\": \"sue\"}}"") {
                repository(name: "_REPO_NAME_") {
                  object(expression: "_BRANCH_/_NAME_") {
                    ... on Tree {
                      entries {
                        name
                        type
                        object {
                          ... on Tree {
                            entries {
                              name
                              type
                              object {
                                ... on Tree {
                                  entries {
                                    name
                                    type
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }`,
            /* eslint-enable no-useless-escape */
          }),
        });
        expect(filterResponse).toBeFalsy();
      });

      it('find pull requests - invalid', () => {
        const filterResponse = filter({
          url: '/graphql',
          method: 'POST',
          body: jsonBuffer({
            query: readFileSync(
              __dirname +
                '/../fixtures/client/github/graphql/find-pull-requests-invalid-query.txt',
            ).toString('utf-8'),
          }),
        });
        expect(filterResponse).toBeFalsy();
      });

      it('find pull requests - open', () => {
        const filterResponse = filter({
          url: '/graphql',
          method: 'POST',
          body: jsonBuffer({
            query: readFileSync(
              __dirname +
                '/../fixtures/client/github/graphql/find-pull-requests-open.txt',
            ).toString('utf-8'),
          }),
        });
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url: '/graphql',
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch('/graphql');
      });

      it('find pull requests - closed', () => {
        const filterResponse = filter({
          url: '/graphql',
          method: 'POST',
          body: jsonBuffer({
            query: readFileSync(
              __dirname +
                '/../fixtures/client/github/graphql/find-pull-requests-closed.txt',
            ).toString('utf-8'),
          }),
        });
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url: '/graphql',
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch('/graphql');
      });

      it('find pull request threads', () => {
        const filterResponse = filter({
          url: '/graphql',
          method: 'POST',
          body: jsonBuffer({
            query: readFileSync(
              __dirname +
                '/../fixtures/client/github/graphql/find-pull-request-threads.txt',
            ).toString('utf-8'),
          }),
        });
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url: '/graphql',
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch('/graphql');
      });

      it('resolve pull request thread', () => {
        const filterResponse = filter({
          url: '/graphql',
          method: 'POST',
          body: jsonBuffer({
            query: readFileSync(
              __dirname +
                '/../fixtures/client/github/graphql/resolve-pull-request-thread.txt',
            ).toString('utf-8'),
          }),
        });
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url: '/graphql',
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch('/graphql');
      });
    });
  });

  describe('on querystring', () => {
    const rules = JSON.parse(loadFixture('relay.json'));
    const filter = loadFilters(rules);

    it('permits requests to an allowed path', () => {
      const url = '/filtered-on-query?filePath=yarn.lock';
      const filterResponse = filter({
        url,
        method: 'GET',
      });
      const filterResponseAsRule = filterResponse as Rule;
      const result = getInterpolatedRequest(
        null,
        filterResponseAsRule,
        {
          url,
          method: 'GET',
        },
        {},
        {},
      );
      expect(result.url).toMatch(url);
    });

    it('permits requests with a path to an allowed nested directory', () => {
      const url = '/filtered-on-query?filePath=/path/to/package.json';
      const filterResponse = filter({
        url,
        method: 'GET',
      });
      const filterResponseAsRule = filterResponse as Rule;
      const result = getInterpolatedRequest(
        null,
        filterResponseAsRule,
        {
          url,
          method: 'GET',
        },
        {},
        {},
      );
      expect(result.url).toMatch(url);
    });

    it('permits requests with path that is a dot file', () => {
      const url = '/filtered-on-query-with-dot?filePath=.Dockerfile';
      const filterResponse = filter({
        url,
        method: 'GET',
      });
      const filterResponseAsRule = filterResponse as Rule;
      const result = getInterpolatedRequest(
        null,
        filterResponseAsRule,
        {
          url,
          method: 'GET',
        },
        {},
        {},
      );
      expect(result.url).toMatch(url);
    });

    it('permits requests with path that contains a dot file', () => {
      const url = '/filtered-on-query-with-dot?filePath=folder/.Dockerfile';
      const filterResponse = filter({
        url,
        method: 'GET',
      });
      const filterResponseAsRule = filterResponse as Rule;
      const result = getInterpolatedRequest(
        null,
        filterResponseAsRule,
        {
          url,
          method: 'GET',
        },
        {},
        {},
      );
      expect(result.url).toMatch(url);
    });

    it('permits requests with path that contains a dot directory', () => {
      const url =
        '/filtered-on-query-with-dot?filePath=.hidden-folder/Dockerfile';
      const filterResponse = filter({
        url,
        method: 'GET',
      });
      const filterResponseAsRule = filterResponse as Rule;
      const result = getInterpolatedRequest(
        null,
        filterResponseAsRule,
        {
          url,
          method: 'GET',
        },
        {},
        {},
      );
      expect(result.url).toMatch(url);
    });

    it('blocks requests to files that are not allowed by the rules', () => {
      const filterResponse = filter({
        url: '/filtered-on-query?filePath=secret.file',
        method: 'GET',
      });
      expect(filterResponse).toBeFalsy();
    });

    it('blocks requests without any querystring', () => {
      const filterResponse = filter({
        url: '/filtered-on-query',
        method: 'GET',
      });
      expect(filterResponse).toBeFalsy();
    });

    it('permits requests with multiple valid query params', () => {
      const url =
        '/filtered-on-multiple-queries?filePath=package.json&download=true';
      const filterResponse = filter({
        url,
        method: 'GET',
      });
      const filterResponseAsRule = filterResponse as Rule;
      const result = getInterpolatedRequest(
        null,
        filterResponseAsRule,
        {
          url,
          method: 'GET',
        },
        {},
        {},
      );
      expect(result.url).toMatch(url);
    });

    it('blocks requests with valid query params when at least one query param is invalid', () => {
      const filterResponse = filter({
        url: '/filtered-on-multiple-queries?filePath=package.json&download=false',
        method: 'GET',
      });
      expect(filterResponse).toBeFalsy();
    });

    it('blocks requests with valid query params when at least one expected query param is missing', () => {
      const filterResponse = filter({
        url: '/filtered-on-multiple-queries?filePath=package.json',
        method: 'GET',
      });
      expect(filterResponse).toBeFalsy();
    });

    describe('fragment identifiers validation', () => {
      it('should not allow access to sensitive files by putting the manifest after a fragment', () => {
        const filterResponse = filter({
          url: '/filtered-on-query?filePath=/path/to/sensitive/file#package.json',
          method: 'GET',
        });
        expect(filterResponse).toBeFalsy();
      });

      it('should ignore any non-manifest files after the fragment identifier', () => {
        const url =
          '/filtered-on-query?filePath=/path/to/package.json#/some-other-file';
        const filterResponse = filter({
          url,
          method: 'GET',
        });
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url,
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch(url);
      });
    });
  });

  describe('on query and body', () => {
    const rules = JSON.parse(loadFixture('relay.json'));
    const filter = loadFilters(rules);

    it('allows a request filtered on query and body', () => {
      const url = '/filtered-on-query-and-body';
      const filterResponse = filter({
        url,
        method: 'POST',
        body: jsonBuffer({
          commits: [
            {
              modified: ['package.json', 'file1.txt'],
            },
          ],
        }),
      });
      const filterResponseAsRule = filterResponse as Rule;
      const result = getInterpolatedRequest(
        null,
        filterResponseAsRule,
        {
          url,
          method: 'GET',
        },
        {},
        {},
      );
      expect(result.url).toMatch(url);
    });

    it('allows a request on query with no body', () => {
      const url = '/filtered-on-query-and-body?filePath=/path/to/package.json';
      const filterResponse = filter({
        url,
        method: 'POST',
      });
      const filterResponseAsRule = filterResponse as Rule;
      const result = getInterpolatedRequest(
        null,
        filterResponseAsRule,
        {
          url,
          method: 'GET',
        },
        {},
        {},
      );
      expect(result.url).toMatch(url);
    });

    it('blocks the request if both body and query path are not allowed', () => {
      const filterResponse = filter({
        url: '/filtered-on-query-and-body?filePath=secret.file',
        method: 'POST',
        body: jsonBuffer({
          commits: [
            {
              modified: ['file2.txt'],
            },
            {
              modified: ['file3.txt', 'file1.txt'],
            },
          ],
        }),
      });
      expect(filterResponse).toBeFalsy();
    });

    it('blocks the request if the body has no valid items', () => {
      const filterResponse = filter({
        url: '/filtered-on-query-and-body',
        method: 'POST',
        body: jsonBuffer({
          commits: [],
        }),
      });
      expect(filterResponse).toBeFalsy();
    });

    describe('fragment identifiers validation', () => {
      it('should not allow access to sensitive files by putting the manifest after a fragment', () => {
        const filterResponse = filter({
          url: '/filtered-on-query-and-body?filePath=/path/to/sensitive/file.js#package.json',
          method: 'POST',
          body: jsonBuffer({
            commits: [],
          }),
        });
        expect(filterResponse).toBeFalsy();
      });

      it('should ignore any non-manifest files after the fragment identifier', () => {
        const url =
          '/filtered-on-query-and-body?filePath=/path/to/package.json#/sensitive/file.js';
        const filterResponse = filter({
          url,
          method: 'POST',
          body: jsonBuffer({
            commits: [],
          }),
        });
        const filterResponseAsRule = filterResponse as Rule;
        const result = getInterpolatedRequest(
          null,
          filterResponseAsRule,
          {
            url,
            method: 'GET',
          },
          {},
          {},
        );
        expect(result.url).toMatch(url);
      });
    });
  });

  describe('on headers', () => {
    const filter = loadFilters(require(__dirname + '/../fixtures/relay.json'));

    it('should block if the provided header does not match those specified in the whitelist', () => {
      const filterResponse = filter({
        url: '/accept-header',
        method: 'GET',
        headers: {
          accept: 'unlisted.header',
        },
      });
      expect(filterResponse).toBeFalsy();
    });

    it('should block if the whitelist specifies a required header but no matching header key is provided', () => {
      const filterResponse = filter({
        url: '/accept-header',
        method: 'GET',
      });
      expect(filterResponse).toBeFalsy();
    });
  });

  // describe('for GitHub', () => {
  //   const rules = JSON.parse(loadFixture(path.join('accept', 'github.json')));
  //   const filter = loadFilters(rules.private);

  //   it('should allow the sha media type header when requesting a branch SHA to prevent patch information being returned', () => {
  //     const url = '/repos/owner/repo-name/commits/master';

  //     const filterResponse = filter(
  //       {
  //         url,
  //         method: 'GET',
  //         headers: {
  //           accept: 'application/vnd.github.v4.sha',
  //         },
  //       }
  //     );
  //     const filterResponseUrl = filterResponse ? filterResponse.url: ''
  //     expect(filterResponseUrl).toMatch(url)
  //   });

  //   it('should block the cryptographer header when requesting a branch SHA to prevent patch information being returned', () => {
  //     const filterResponse = filter(
  //       {
  //         url: '/repos/owner/repo-name/commits/master',
  //         method: 'GET',
  //         headers: {
  //           accept: 'application/vnd.github.cryptographer-preview',
  //         },
  //       }
  //     );
  //     expect(filterResponse).toBeFalsy()
  //   });
  // });

  // describe('for GHE', () => {
  //   const rules = JSON.parse(loadFixture(path.join('accept', 'ghe.json')));
  //   const filter = loadFilters(rules.private);

  //   it('should allow valid encoded /Dockerfile path to manifest', () => {
  //     const url =
  //       '/repos/repo-owner/repo-name/contents/%2Fsome-path%2FDockerfile?ref=master';
  //       const filterResponse = filter(
  //       {
  //         url,
  //         method: 'GET',
  //       }
  //     );
  //     const filterResponseUrl = filterResponse ? filterResponse.url: ''
  //     expect(filterResponseUrl).toMatch(url)
  //   });

  //   it('should allow getting PR files', () => {
  //     const url = '/repos/a-repo-owner/a-repo-name/pulls/54321/files?page=123';
  //     const filterResponse = filter(
  //       {
  //         url,
  //         method: 'GET',
  //       }
  //     );
  //     const filterResponseUrl = filterResponse ? filterResponse.url: ''
  //     expect(filterResponseUrl).toMatch(url)
  //   });
  // });
});

describe('with auth', () => {
  const rules = JSON.parse(loadFixture('relay.json'));
  const filter = loadFilters(rules);

  it('allows correct basic auth requests', () => {
    const url = '/basic-auth';
    const filterResponse = filter({
      url,
      method: 'GET',
    });
    const filterResponseAsRule = filterResponse as Rule;
    const result = getInterpolatedRequest(
      null,
      filterResponseAsRule,
      {
        url,
        method: 'GET',
      },
      {},
      {},
    );
    expect(result.auth).toEqual(
      `Basic ${Buffer.from('user:pass').toString('base64')}`,
    );
  });

  it('allows requests with a correct token', () => {
    const url = '/token-auth';
    const filterResponse = filter({
      url,
      method: 'GET',
    });
    const filterResponseAsRule = filterResponse as Rule;
    const result = getInterpolatedRequest(
      null,
      filterResponseAsRule,
      {
        url,
        method: 'GET',
      },
      {},
      {},
    );
    expect(result.auth).toEqual('Token 1234');
  });
});

describe('Github big files (optional rules)', () => {
  const rules = JSON.parse(
    loadFixture(path.join('accept', 'github-big-files.json')),
  );
  const filter = loadFilters(rules.private);

  it('should allow the get file sha API', () => {
    const url = '/graphql';
    const filterResponse = filter({
      url,
      method: 'POST',
      body: jsonBuffer({
        query:
          '{\n        repository(owner: "some-owner", name: "some-name") {\n          object(expression: "refs/heads/some-thing:a/path/to/package-lock.json") {\n            ... on Blob {\n              oid,\n            }\n          }\n        }\n      }',
      }),
    });
    const filterResponseAsRule = filterResponse as Rule;
    const result = getInterpolatedRequest(
      null,
      filterResponseAsRule,
      {
        url,
        method: 'GET',
      },
      {},
      {},
    );
    expect(result.url).toEqual('/graphql');
  });
});
