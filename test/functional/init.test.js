const fs = require('then-fs');
const test = require('tap-only');
const tmp = require('tmp');

const init = require('../../cli/init');

tmp.setGracefulCleanup(); // always remove temporary directories

const templates = ['bitbucket-server', 'github', 'gitlab'];

templates.forEach(template => {
  test(`init creates files from "${template}" template`, t => {
    const originalWorkDir = process.cwd();
    t.teardown(() => process.chdir(originalWorkDir));

    tmp.dir({ unsafeCleanup: true }, (err, path) => {
      if (err) { throw err; }
      process.chdir(path);

      init({_: [template]})
        .then(() => Promise.all([
          fs.stat('.env'),
          fs.stat('accept.json'),
        ]))
        .then(stats => {
          t.ok(stats.every(Boolean), 'all templated files created');
          t.doesNotThrow(
            () => JSON.parse(fs.readFileSync('accept.json')),
            'accept.json is valid JSON');
          t.end();
        });
    });
  });
});
