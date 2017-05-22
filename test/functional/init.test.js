const fs = require('then-fs');
const test = require('tap-only');
const tmp = require('tmp');

const init = require('../../cli/init');

tmp.setGracefulCleanup(); // always remove temporary directories

test('init creates files from specified client-templates', t => {
  const originalWorkDir = process.cwd();
  t.teardown(() => process.chdir(originalWorkDir));

  tmp.dir({ unsafeCleanup: true }, (err, path) => {
    if (err) { throw err; }
    process.chdir(path);

    init({_: ['github']})
    .then(() => Promise.all([
      fs.stat('.env'),
      fs.stat('accept.json'),
    ]))
    .then(stats => {
      t.ok(stats.every(Boolean), 'all templated files created');
      t.end();
    });
  });
});

test('init creates files from specified bitbucket', t => {
  const originalWorkDir = process.cwd();
  t.teardown(() => process.chdir(originalWorkDir));

  tmp.dir({ unsafeCleanup: true }, (err, path) => {
    if (err) { throw err; }
    process.chdir(path);

    init({_: ['bitbucket-server']})
      .then(() => Promise.all([
        fs.stat('.env'),
        fs.stat('accept.json'),
      ]))
      .then(stats => {
        t.ok(stats.every(Boolean), 'all templated files created');
        t.end();
      });
  });
});
