import { readFileSync } from 'fs';
import * as path from 'path';

import * as Filters from '../../lib/filters';

const jsonBuffer = (body) => Buffer.from(JSON.stringify(body));

function loadFixture(name: string) {
  const fixturePath = path.join(__dirname, '..', 'fixtures', name);
  return readFileSync(fixturePath, { encoding: 'utf-8' });
}

describe('filters', () => {
  describe('on URL', () => {
    describe('for GitHub private filters', () => {
      const rules = JSON.parse(loadFixture(path.join('accept', 'github.json')));
      const filter = Filters(rules.private);

      it('should allow valid /repos path to manifest', () => {
        const url = '/repos/angular/angular/contents/package.json';

        filter(
          {
            url,
            method: 'GET',
          },
          (error, res) => {
            expect(error).toBeNull();
            expect(res.url).toMatch(url);
          },
        );
      });

      it('should remove any fragments identifier', () => {
        filter(
          {
            url: '/repos/angular/angular/contents/test-main.js#/package.json',
            method: 'GET',
          },
          (error, res) => {
            expect(error).toBeNull();
            expect(res.url).not.toContain('#');
          },
        );
      });

      it('should block when path includes directory traversal', () => {
        filter(
          {
            url: '/repos/angular/angular/contents/path/to/docs/../../sensitive/file.js',
            method: 'GET',
          },
          (error, res) => {
            expect(error.message).toEqual('blocked');
            expect(res).toBeUndefined();
          },
        );
      });
    });
  });

  describe('on body', () => {
    const rules = JSON.parse(loadFixture('relay.json'));
    const filter = Filters(rules);

    it('allows requests that match', (done) => {
      filter(
        {
          url: '/',
          method: 'POST',
          body: jsonBuffer({
            commits: [
              {
                modified: ['package.json', 'file1.txt'],
              },
            ],
          }),
        },
        (error, res) => {
          expect(error).toBeNull();
          expect(res.url).toEqual('/');
          done();
        },
      );
    });

    it('allows requests with partial matches across multiple commits', (done) => {
      filter(
        {
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
        },
        (error, res) => {
          expect(error).toBeNull();
          expect(res.url).toEqual('/');
          done();
        },
      );
    });

    it('blocks files if not explicitly allowed by filter rules', () => {
      filter(
        {
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
        },
        (error, res) => {
          expect(error.message).toEqual('blocked');
          expect(res).toBeUndefined();
        },
      );
    });

    it('blocks requests with no valid items', (done) => {
      filter(
        {
          url: '/',
          method: 'POST',
          body: jsonBuffer({
            commits: [],
          }),
        },
        (error, res) => {
          expect(error.message).toEqual('blocked');
          expect(res).toBeUndefined();
          done();
        },
      );
    });

    describe('graphql', () => {
      it('find globs - valid query', (done) => {
        filter(
          {
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
          },
          (error, res) => {
            expect(error).toBeNull();
            expect(res.url).toEqual('/graphql');
            done();
          },
        );
      });

      it('find globs - noSQL injection', (done) => {
        filter(
          {
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
          },
          (error, res) => {
            expect(error).toEqual(expect.any(Error));
            expect(error.message).toEqual('blocked');
            expect(res).toBeUndefined();
            done();
          },
        );
      });

      it('find pull requests - invalid', (done) => {
        filter(
          {
            url: '/graphql',
            method: 'POST',
            body: jsonBuffer({
              query: readFileSync(
                __dirname +
                  '/../fixtures/client/github/graphql/find-pull-requests-invalid-query.txt',
              ).toString('utf-8'),
            }),
          },
          (error, res) => {
            expect(error).toEqual(expect.any(Error));
            expect(error.message).toEqual('blocked');
            expect(res).toBeUndefined();
            done();
          },
        );
      });

      it('find pull requests - open', (done) => {
        filter(
          {
            url: '/graphql',
            method: 'POST',
            body: jsonBuffer({
              query: readFileSync(
                __dirname +
                  '/../fixtures/client/github/graphql/find-pull-requests-open.txt',
              ).toString('utf-8'),
            }),
          },
          (error, res) => {
            expect(error).toBeNull();
            expect(res.url).toEqual('/graphql');
            done();
          },
        );
      });

      it('find pull requests - closed', (done) => {
        filter(
          {
            url: '/graphql',
            method: 'POST',
            body: jsonBuffer({
              query: readFileSync(
                __dirname +
                  '/../fixtures/client/github/graphql/find-pull-requests-closed.txt',
              ).toString('utf-8'),
            }),
          },
          (error, res) => {
            expect(error).toBeNull();
            expect(res.url).toEqual('/graphql');
            done();
          },
        );
      });
    });
  });

  describe('on querystring', () => {
    const rules = JSON.parse(loadFixture('relay.json'));
    const filter = Filters(rules);

    it('permits requests to an allowed path', (done) => {
      filter(
        {
          url: '/filtered-on-query?filePath=yarn.lock',
          method: 'GET',
        },
        (error, res) => {
          expect(error).toBeNull();
          expect(res.url).toEqual('/filtered-on-query?filePath=yarn.lock');
          done();
        },
      );
    });

    it('permits requests with a path to an allowed nested directory', (done) => {
      filter(
        {
          url: '/filtered-on-query?filePath=/path/to/package.json',
          method: 'GET',
        },
        (error, res) => {
          expect(error).toBeNull();
          expect(res.url).toEqual(
            '/filtered-on-query?filePath=/path/to/package.json',
          );
          done();
        },
      );
    });

    it('permits requests with path that is a dot file', (done) => {
      filter(
        {
          url: '/filtered-on-query-with-dot?filePath=.Dockerfile',
          method: 'GET',
        },
        (error, res) => {
          expect(error).toBeNull();
          expect(res.url).toEqual(
            '/filtered-on-query-with-dot?filePath=.Dockerfile',
          );
          done();
        },
      );
    });

    it('permits requests with path that contains a dot file', (done) => {
      filter(
        {
          url: '/filtered-on-query-with-dot?filePath=folder/.Dockerfile',
          method: 'GET',
        },
        (error, res) => {
          expect(error).toBeNull();
          expect(res.url).toEqual(
            '/filtered-on-query-with-dot?filePath=folder/.Dockerfile',
          );
          done();
        },
      );
    });

    it('permits requests with path that contains a dot directory', (done) => {
      filter(
        {
          url: '/filtered-on-query-with-dot?filePath=.hidden-folder/Dockerfile',
          method: 'GET',
        },
        (error, res) => {
          expect(error).toBeNull();
          expect(res.url).toEqual(
            '/filtered-on-query-with-dot?filePath=.hidden-folder/Dockerfile',
          );
          done();
        },
      );
    });

    it('blocks requests to files that are not allowed by the rules', (done) => {
      filter(
        {
          url: '/filtered-on-query?filePath=secret.file',
          method: 'GET',
        },
        (error, res) => {
          expect(error.message).toEqual('blocked');
          expect(res).toBeUndefined();
          done();
        },
      );
    });

    it('blocks requests without any querystring', (done) => {
      filter(
        {
          url: '/filtered-on-query',
          method: 'GET',
        },
        (error, res) => {
          expect(error.message).toEqual('blocked');
          expect(res).toBeUndefined();
          done();
        },
      );
    });

    it('permits requests with multiple valid query params', (done) => {
      filter(
        {
          url: '/filtered-on-multiple-queries?filePath=package.json&download=true',
          method: 'GET',
        },
        (error, res) => {
          expect(error).toBeNull();
          expect(res.url).toEqual(
            '/filtered-on-multiple-queries?filePath=package.json&download=true',
          );
          done();
        },
      );
    });

    it('blocks requests with valid query params when at least one query param is invalid', (done) => {
      filter(
        {
          url: '/filtered-on-multiple-queries?filePath=package.json&download=false',
          method: 'GET',
        },
        (error, res) => {
          expect(error.message).toEqual('blocked');
          expect(res).toBeUndefined();
          done();
        },
      );
    });

    it('blocks requests with valid query params when at least one expected query param is missing', (done) => {
      filter(
        {
          url: '/filtered-on-multiple-queries?filePath=package.json',
          method: 'GET',
        },
        (error, res) => {
          expect(error.message).toEqual('blocked');
          expect(res).toBeUndefined();
          done();
        },
      );
    });

    describe('fragment identifiers validation', () => {
      it('should not allow access to sensitive files by putting the manifest after a fragment', (done) => {
        filter(
          {
            url: '/filtered-on-query?filePath=/path/to/sensitive/file#package.json',
            method: 'GET',
          },
          (error, res) => {
            expect(error.message).toEqual('blocked');
            expect(res).toBeUndefined();
            done();
          },
        );
      });

      it('should ignore any non-manifest files after the fragment identifier', (done) => {
        filter(
          {
            url: '/filtered-on-query?filePath=/path/to/package.json#/some-other-file',
            method: 'GET',
          },
          (error, res) => {
            expect(error).toBeNull();
            expect(res.url).toEqual(
              '/filtered-on-query?filePath=/path/to/package.json',
            );
            done();
          },
        );
      });
    });
  });

  describe('on query and body', () => {
    const rules = JSON.parse(loadFixture('relay.json'));
    const filter = Filters(rules);

    it('allows a request filtered on query and body', (done) => {
      filter(
        {
          url: '/filtered-on-query-and-body',
          method: 'POST',
          body: jsonBuffer({
            commits: [
              {
                modified: ['package.json', 'file1.txt'],
              },
            ],
          }),
        },
        (error, res) => {
          expect(error).toBeNull();
          expect(res.url).toEqual('/filtered-on-query-and-body');
          done();
        },
      );
    });

    it('allows a request on query with no body', (done) => {
      filter(
        {
          url: '/filtered-on-query-and-body?filePath=/path/to/package.json',
          method: 'POST',
        },
        (error, res) => {
          expect(error).toBeNull();
          expect(res.url).toEqual(
            '/filtered-on-query-and-body?filePath=/path/to/package.json',
          );
          done();
        },
      );
    });

    it('blocks the request if both body and query path are not allowed', (done) => {
      filter(
        {
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
        },
        (error, res) => {
          expect(error.message).toEqual('blocked');
          expect(res).toBeUndefined();
          done();
        },
      );
    });

    it('blocks the request if the body has no valid items', (done) => {
      filter(
        {
          url: '/filtered-on-query-and-body',
          method: 'POST',
          body: jsonBuffer({
            commits: [],
          }),
        },
        (error, res) => {
          expect(error.message).toEqual('blocked');
          expect(res).toBeUndefined();
          done();
        },
      );
    });

    describe('fragment identifiers validation', () => {
      it('should not allow access to sensitive files by putting the manifest after a fragment', (done) => {
        filter(
          {
            url: '/filtered-on-query-and-body?filePath=/path/to/sensitive/file.js#package.json',
            method: 'POST',
            body: jsonBuffer({
              commits: [],
            }),
          },
          (error, res) => {
            expect(error.message).toEqual('blocked');
            expect(res).toBeUndefined();
            done();
          },
        );
      });

      it('should ignore any non-manifest files after the fragment identifier', (done) => {
        filter(
          {
            url: '/filtered-on-query-and-body?filePath=/path/to/package.json#/sensitive/file.js',
            method: 'POST',
            body: jsonBuffer({
              commits: [],
            }),
          },
          (error, res) => {
            expect(error).toBeNull();
            expect(res.url).toEqual(
              '/filtered-on-query-and-body?filePath=/path/to/package.json',
            );
            done();
          },
        );
      });
    });
  });

  describe('on headers', () => {
    const filter = Filters(require(__dirname + '/../fixtures/relay.json'));

    it('should block if the provided header does not match those specified in the whitelist', (done) => {
      filter(
        {
          url: '/accept-header',
          method: 'GET',
          headers: {
            accept: 'unlisted.header',
          },
        },
        (error, res) => {
          expect(error.message).toEqual('blocked');
          expect(res).toBeUndefined();
          done();
        },
      );
    });

    it('should block if the whitelist specifies a required header but no matching header key is provided', (done) => {
      filter(
        {
          url: '/accept-header',
          method: 'GET',
        },
        (error, res) => {
          expect(error.message).toEqual('blocked');
          expect(res).toBeUndefined();
          done();
        },
      );
    });
  });

  describe('for GitHub', () => {
    const rules = JSON.parse(loadFixture(path.join('accept', 'github.json')));
    const filter = Filters(rules.private);

    it('should allow the sha media type header when requesting a branch SHA to prevent patch information being returned', (done) => {
      const url = '/repos/owner/repo-name/commits/master';

      filter(
        {
          url,
          method: 'GET',
          headers: {
            accept: 'application/vnd.github.v4.sha',
          },
        },
        (error, res) => {
          expect(error).toBeNull();
          expect(res.url).toMatch(url);
          done();
        },
      );
    });

    it('should block the cryptographer header when requesting a branch SHA to prevent patch information being returned', (done) => {
      filter(
        {
          url: '/repos/owner/repo-name/commits/master',
          method: 'GET',
          headers: {
            accept: 'application/vnd.github.cryptographer-preview',
          },
        },
        (error, res) => {
          expect(error.message).toEqual('blocked');
          expect(res).toBeUndefined();
          done();
        },
      );
    });

    it('should allow the get file in the root directory for code snippets', async () => {
      const url =
        '/repos/owner/repo-name/contents/main.js?ref=e5d896304278f15be39e5b13ab7f0f2add9f8e3e';

      filter(
        {
          url,
          method: 'GET',
        },
        (error, res) => {
          expect(error).toBeNull();
          expect(res.url).toMatch(url);
        },
      );
    });

    it('should allow the get file in the nested directory for code snippets', async () => {
      const url =
        '/repos/owner/repo-name/contents/nested-folder/main.js?ref=e5d896304278f15be39e5b13ab7f0f2add9f8e3e';

      filter(
        {
          url,
          method: 'GET',
        },
        (error, res) => {
          expect(error).toBeNull();
          expect(res.url).toMatch(url);
        },
      );
    });
  });

  describe('for GHE', () => {
    const rules = JSON.parse(loadFixture(path.join('accept', 'ghe.json')));
    const filter = Filters(rules.private);

    it('should allow valid encoded /Dockerfile path to manifest', () => {
      const url =
        '/repos/repo-owner/repo-name/contents/%2Fsome-path%2FDockerfile?ref=master';
      filter(
        {
          url,
          method: 'GET',
        },
        (error, res) => {
          expect(error).toBeNull();
          expect(res.url).toMatch(url);
        },
      );
    });
  });
});

describe('with auth', () => {
  const rules = JSON.parse(loadFixture('relay.json'));
  const filter = Filters(rules);

  it('allows correct basic auth requests', (done) => {
    filter(
      {
        url: '/basic-auth',
        method: 'GET',
      },
      (error, res) => {
        expect(error).toBeNull();
        expect(res.auth).toEqual(
          `Basic ${Buffer.from('user:pass').toString('base64')}`,
        );
        done();
      },
    );
  });

  it('allows requests with a correct token', (done) => {
    filter(
      {
        url: '/token-auth',
        method: 'GET',
      },
      (error, res) => {
        expect(error).toBeNull();
        expect(res.auth).toEqual('Token 1234');
        done();
      },
    );
  });
});

describe('Github big files (optional rules)', () => {
  const rules = JSON.parse(
    loadFixture(path.join('accept', 'github-big-files.json')),
  );
  const filter = Filters(rules.private);

  it('should allow the get file sha API', (done) => {
    filter(
      {
        url: '/graphql',
        method: 'POST',
        body: jsonBuffer({
          query:
            '{\n        repository(owner: "some-owner", name: "some-name") {\n          object(expression: "refs/heads/some-thing:a/path/to/package-lock.json") {\n            ... on Blob {\n              oid,\n            }\n          }\n        }\n      }',
        }),
      },
      (error, res) => {
        expect(error).toBeNull();
        expect(res.url).toEqual('/graphql');
        done();
      },
    );
  });
});
