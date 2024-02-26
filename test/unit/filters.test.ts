import { readFileSync } from 'fs';
import path from 'path';

import { loadFilters } from '../../lib/common/filter/filtersAsync';

const jsonBuffer = (body) => Buffer.from(JSON.stringify(body));

function loadFixture(name: string) {
  const fixturePath = path.join(__dirname, '..', 'fixtures', name);
  const fixture = readFileSync(fixturePath, { encoding: 'utf-8' });

  return fixture;
}

describe('filters', () => {
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
        const filterResponseUrl = filterResponse ? filterResponse.url : '';
        expect(filterResponseUrl).toMatch(url);
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
      const filterResponseUrl = filterResponse ? filterResponse.url : '';
      expect(filterResponseUrl).toEqual('/');
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
      const filterResponseUrl = filterResponse ? filterResponse.url : '';
      expect(filterResponseUrl).toEqual('/');
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
        const filterResponseUrl = filterResponse ? filterResponse.url : '';
        expect(filterResponseUrl).toEqual('/graphql');
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
        const filterResponseUrl = filterResponse ? filterResponse.url : '';
        expect(filterResponseUrl).toEqual('/graphql');
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
        const filterResponseUrl = filterResponse ? filterResponse.url : '';
        expect(filterResponseUrl).toEqual('/graphql');
      });
    });
  });

  describe('on querystring', () => {
    const rules = JSON.parse(loadFixture('relay.json'));
    const filter = loadFilters(rules);

    it('permits requests to an allowed path', () => {
      const filterResponse = filter({
        url: '/filtered-on-query?filePath=yarn.lock',
        method: 'GET',
      });
      const filterResponseUrl = filterResponse ? filterResponse.url : '';
      expect(filterResponseUrl).toEqual(
        '/filtered-on-query?filePath=yarn.lock',
      );
    });

    it('permits requests with a path to an allowed nested directory', () => {
      const filterResponse = filter({
        url: '/filtered-on-query?filePath=/path/to/package.json',
        method: 'GET',
      });
      const filterResponseUrl = filterResponse ? filterResponse.url : '';
      expect(filterResponseUrl).toEqual(
        '/filtered-on-query?filePath=/path/to/package.json',
      );
    });

    it('permits requests with path that is a dot file', () => {
      const filterResponse = filter({
        url: '/filtered-on-query-with-dot?filePath=.Dockerfile',
        method: 'GET',
      });
      const filterResponseUrl = filterResponse ? filterResponse.url : '';
      expect(filterResponseUrl).toEqual(
        '/filtered-on-query-with-dot?filePath=.Dockerfile',
      );
    });

    it('permits requests with path that contains a dot file', () => {
      const filterResponse = filter({
        url: '/filtered-on-query-with-dot?filePath=folder/.Dockerfile',
        method: 'GET',
      });
      const filterResponseUrl = filterResponse ? filterResponse.url : '';
      expect(filterResponseUrl).toEqual(
        '/filtered-on-query-with-dot?filePath=folder/.Dockerfile',
      );
    });

    it('permits requests with path that contains a dot directory', () => {
      const filterResponse = filter({
        url: '/filtered-on-query-with-dot?filePath=.hidden-folder/Dockerfile',
        method: 'GET',
      });
      const filterResponseUrl = filterResponse ? filterResponse.url : '';
      expect(filterResponseUrl).toEqual(
        '/filtered-on-query-with-dot?filePath=.hidden-folder/Dockerfile',
      );
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
      const filterResponse = filter({
        url: '/filtered-on-multiple-queries?filePath=package.json&download=true',
        method: 'GET',
      });
      const filterResponseUrl = filterResponse ? filterResponse.url : '';
      expect(filterResponseUrl).toEqual(
        '/filtered-on-multiple-queries?filePath=package.json&download=true',
      );
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
        const filterResponse = filter({
          url: '/filtered-on-query?filePath=/path/to/package.json#/some-other-file',
          method: 'GET',
        });
        const filterResponseUrl = filterResponse ? filterResponse.url : '';
        expect(filterResponseUrl).toEqual(
          '/filtered-on-query?filePath=/path/to/package.json',
        );
      });
    });
  });

  describe('on query and body', () => {
    const rules = JSON.parse(loadFixture('relay.json'));
    const filter = loadFilters(rules);

    it('allows a request filtered on query and body', () => {
      const filterResponse = filter({
        url: '/filtered-on-query-and-body',
        method: 'POST',
        body: jsonBuffer({
          commits: [
            {
              modified: ['package.json', 'file1.txt'],
            },
          ],
        }),
      });
      const filterResponseUrl = filterResponse ? filterResponse.url : '';
      expect(filterResponseUrl).toEqual('/filtered-on-query-and-body');
    });

    it('allows a request on query with no body', () => {
      const filterResponse = filter({
        url: '/filtered-on-query-and-body?filePath=/path/to/package.json',
        method: 'POST',
      });
      const filterResponseUrl = filterResponse ? filterResponse.url : '';
      expect(filterResponseUrl).toEqual(
        '/filtered-on-query-and-body?filePath=/path/to/package.json',
      );
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
        const filterResponse = filter({
          url: '/filtered-on-query-and-body?filePath=/path/to/package.json#/sensitive/file.js',
          method: 'POST',
          body: jsonBuffer({
            commits: [],
          }),
        });
        const filterResponseUrl = filterResponse ? filterResponse.url : '';
        expect(filterResponseUrl).toEqual(
          '/filtered-on-query-and-body?filePath=/path/to/package.json',
        );
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
    const filterResponse = filter({
      url: '/basic-auth',
      method: 'GET',
    });
    const filterResponseAuth = filterResponse ? filterResponse.auth : '';
    expect(filterResponseAuth).toEqual(
      `Basic ${Buffer.from('user:pass').toString('base64')}`,
    );
  });

  it('allows requests with a correct token', () => {
    const filterResponse = filter({
      url: '/token-auth',
      method: 'GET',
    });
    const filterResponseAuth = filterResponse ? filterResponse.auth : '';
    expect(filterResponseAuth).toEqual('Token 1234');
  });
});

describe('Github big files (optional rules)', () => {
  const rules = JSON.parse(
    loadFixture(path.join('accept', 'github-big-files.json')),
  );
  const filter = loadFilters(rules.private);

  it('should allow the get file sha API', () => {
    const filterResponse = filter({
      url: '/graphql',
      method: 'POST',
      body: jsonBuffer({
        query:
          '{\n        repository(owner: "some-owner", name: "some-name") {\n          object(expression: "refs/heads/some-thing:a/path/to/package-lock.json") {\n            ... on Blob {\n              oid,\n            }\n          }\n        }\n      }',
      }),
    });
    const filterResponseUrl = filterResponse ? filterResponse.url : '';
    expect(filterResponseUrl).toEqual('/graphql');
  });
});
