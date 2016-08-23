const fs = require('then-fs');
const path = require('path');
const root = path.resolve(__dirname, '../client-templates/');

module.exports = (args) => {
  if (args.logs) {
    require('debug').enable('broker');
  }

  const debug = require('debug')('broker');

  const project = args._[0];
  if (!project) {
    throw new Error('init requires a template name');
  }

  const dir = path.resolve(root, project);

  return fs.readdir(root).then(files => {
    if (!files.includes(project)) {
      throw new Error(`${project} is an invalid template name`);
    }

    return fs.readdir(dir);
  }).then(files => {
    // check if any of the files exist on disk already, and if so, abort.
    return Promise.all(files.map(file => {
      file = file.replace(/\.sample$/, '');
      return fs.stat(file).then(() => file).catch(() => false);
    })).then(stats => {
      const exists = stats.filter(Boolean);

      if (exists.length) {
        throw new Error('The following file(s) exist and cannot be overwritten, please move them: ' + exists.map(_ => `${_}`).join(' '));
      }
      // if any files exist, throw
      return files;
    });
  }).then(files => {
    for (const file of files) {
      const newfile = file.replace(/\.sample$/, '');
      debug(`generating: ${newfile}`);
      fs.createReadStream(
        path.resolve(dir, file)
      ).pipe(fs.createWriteStream(
        path.resolve(process.cwd(), newfile)
      ));
    }

    debug(`${project} initialisation complete`);
  });
};
