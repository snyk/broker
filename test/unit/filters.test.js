const test = require('tap').test;
const Filters = require('../../lib/filters');

const jsonBuffer = (body) => Buffer.from(JSON.stringify(body));

test('filter on body', t => {
  const filter = Filters(require(__dirname + '/../fixtures/relay.json'));

  t.plan(9);
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
    t.equal(res, '/', 'allows the path request');
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
    t.equal(res, '/', 'allows the path request');
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
    t.equal(res, '/filtered-on-query?filePath=/path/to/package.json',
      'allows the path request');
  });

  filter({
    url: '/filtered-on-query?filePath=yarn.lock',
    method: 'GET',
  }, (error, res) => {
    t.equal(error, null, 'no error');
    t.equal(res, '/filtered-on-query?filePath=yarn.lock',
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
    t.equal(res, '/filtered-on-query-and-body', 'allows the path request');
  });

  filter({
    url: '/filtered-on-query-and-body?filePath=/path/to/package.json',
    method: 'POST'
  }, (error, res) => {
    t.equal(error, null, 'no error');
    t.equal(res, '/filtered-on-query-and-body?filePath=/path/to/package.json',
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
