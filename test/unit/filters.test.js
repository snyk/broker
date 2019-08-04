const test = require('tap').test;
const fs = require('fs');

const Filters = require('../../lib/filters');

const jsonBuffer = (body) => Buffer.from(JSON.stringify(body));

test('filter on body', t => {
  const filter = Filters(require(__dirname + '/../fixtures/relay.json'));

  t.pass('filters loaded');

  filter({
    url: '/',
    method: 'POST',
    body: jsonBuffer({
      commits: [
        {
          modified: ['package.json', 'file1.txt']
        }
      ]
    })
  }, (error, res) => {
    t.equal(error, null, 'no error');
    t.equal(res.url, '/', 'allows the path request');
  });

  filter({
    url: '/',
    method: 'POST',
    body: jsonBuffer({
      commits: [
        {
          modified: ['file2.txt']
        },
        {
          modified: ['.snyk', 'file1.txt']
        }
      ]
    })
  }, (error, res) => {
    t.equal(error, null, 'no error');
    t.equal(res.url, '/', 'allows the path request');
  });

  filter({
    url: '/',
    method: 'POST',
    body: jsonBuffer({
      commits: [
        {
          modified: ['file2.txt']
        },
        {
          modified: ['file3.txt', 'file1.txt']
        }
      ]
    })
  }, (error, res) => {
    t.equal(error.message, 'blocked', 'has been blocked');
    t.equal(res, undefined, 'no follow allowed');
  });

  filter({
    url: '/',
    method: 'POST',
    body: jsonBuffer({
      commits: []
    })
  }, (error, res) => {
    t.equal(error.message, 'blocked', 'has been blocked');
    t.equal(res, undefined, 'no follow allowed');
  });

  t.test('graphql - find globs - valid query', (t) => {
    filter({
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
      })
    }, (error, res) => {
      t.equal(error, null, 'no error');
      t.equal(res.url, '/graphql', 'allows the path request');
    });
    t.end();
  });

  t.test('graphql - find globs - noSQL injection', (t) => {
    filter({
      url: '/graphql',
      method: 'POST',
      body: jsonBuffer({
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
      })
    }, (error, res) => {
      t.ok(error, 'got an error');
      t.equal(error.message, 'blocked', 'has been blocked');
      t.equal(res, undefined, 'no follow allowed');
    });
    t.end();
  });

  t.test('graphql - find pull requests - invalid', (t) => {
    filter({
      url: '/graphql',
      method: 'POST',
      body: jsonBuffer({
        query: fs
          .readFileSync(__dirname + '/../fixtures/client/github/graphql/find-pull-requests-invalid-query.txt')
          .toString('utf-8'),
      })
    }, (error, res) => {
      t.ok(error, 'got an error');
      t.equal(error.message, 'blocked', 'has been blocked');
      t.equal(res, undefined, 'no follow allowed');
      t.end();
    });
  });

  t.test('graphql - find pull requests - open', (t) => {
    filter({
      url: '/graphql',
      method: 'POST',
      body: jsonBuffer({
        query: fs
          .readFileSync(__dirname + '/../fixtures/client/github/graphql/find-pull-requests-open.txt')
          .toString('utf-8'),
      })
    }, (error, res) => {

      t.equal(error, null, 'no error');
      t.equal(res.url, '/graphql', 'allows the path request');
      t.end();
    });
  });

  t.test('graphql - find pull requests - closed', (t) => {
    filter({
      url: '/graphql',
      method: 'POST',
      body: jsonBuffer({
        query: fs
          .readFileSync(__dirname + '/../fixtures/client/github/graphql/find-pull-requests-closed.txt')
          .toString('utf-8'),
      })
    }, (error, res) => {

      t.equal(error, null, 'no error');
      t.equal(res.url, '/graphql', 'allows the path request');
      t.end();
    });
  });

  t.end();

});

test('filter on querystring', t => {
  const filter = Filters(require(__dirname + '/../fixtures/relay.json'));

  t.plan(9);
  t.pass('filters loaded');

  filter({
    url: '/filtered-on-query?filePath=/path/to/package.json',
    method: 'GET',
  }, (error, res) => {
    t.equal(error, null, 'no error');
    t.equal(res.url, '/filtered-on-query?filePath=/path/to/package.json',
      'allows the path request');
  });

  filter({
    url: '/filtered-on-query?filePath=yarn.lock',
    method: 'GET',
  }, (error, res) => {
    t.equal(error, null, 'no error');
    t.equal(res.url, '/filtered-on-query?filePath=yarn.lock',
      'allows the path request');
  });

  filter({
    url: '/filtered-on-query?filePath=secret.file',
    method: 'GET',
  }, (error, res) => {
    t.equal(error.message, 'blocked', 'has been blocked');
    t.equal(res, undefined, 'no follow allowed');
  });

  filter({
    url: '/filtered-on-query',
    method: 'GET',
  }, (error, res) => {
    t.equal(error.message, 'blocked', 'has been blocked');
    t.equal(res, undefined, 'no follow allowed');
  });
});

test('filter on query and body', t => {
  const filter = Filters(require(__dirname + '/../fixtures/relay.json'));

  t.plan(9);
  t.pass('filters loaded');

  filter({
    url: '/filtered-on-query-and-body',
    method: 'POST',
    body: jsonBuffer({
      commits: [
        {
          modified: ['package.json', 'file1.txt']
        }
      ]
    })
  }, (error, res) => {
    t.equal(error, null, 'no error');
    t.equal(res.url, '/filtered-on-query-and-body', 'allows the path request');
  });

  filter({
    url: '/filtered-on-query-and-body?filePath=/path/to/package.json',
    method: 'POST'
  }, (error, res) => {
    t.equal(error, null, 'no error');
    t.equal(res.url, '/filtered-on-query-and-body?filePath=/path/to/package.json',
      'allows the path request');
  });

  filter({
    url: '/filtered-on-query-and-body?filePath=secret.file',
    method: 'POST',
    body: jsonBuffer({
      commits: [
        {
          modified: ['file2.txt']
        },
        {
          modified: ['file3.txt', 'file1.txt']
        }
      ]
    })
  }, (error, res) => {
    t.equal(error.message, 'blocked', 'has been blocked');
    t.equal(res, undefined, 'no follow allowed');
  });

  filter({
    url: '/filtered-on-query-and-body',
    method: 'POST',
    body: jsonBuffer({
      commits: []
    })
  }, (error, res) => {
    t.equal(error.message, 'blocked', 'has been blocked');
    t.equal(res, undefined, 'no follow allowed');
  });
});

test('filter with auth', t => {
  const filter = Filters(require(__dirname + '/../fixtures/relay.json'));

  t.plan(5);
  t.pass('filters loaded');

  filter({
    url: '/basic-auth',
    method: 'GET',
  }, (error, res) => {
    t.equal(error, null, 'no error');
    t.equal(res.auth, `Basic ${new Buffer('user:pass').toString('base64')}`,
      'basic auth header returned');
  });

  filter({
    url: '/token-auth',
    method: 'GET',
  }, (error, res) => {
    t.equal(error, null, 'no error');
    t.equal(res.auth, 'Token 1234', 'token auth header returned');
  });
});
