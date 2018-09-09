const fs = require('then-fs');
const path = require('path');
const root = path.resolve(__dirname, '../client-templates/');
const logger = require('../lib/log');

module.exports = (args) => {

  const template = args._[0];
  if (!template) {
    throw new Error('init requires a template name');
  }

  const dir = path.resolve(root, template);

  return fs.readdir(root).then(files => {
    if (files.indexOf(template) === -1) {
      throw new Error(`${template} is an invalid template name`);
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
    return Promise.all(
      files.map(file =>
        new Promise((resolve, reject) => {
          const newfile = file.replace(/\.sample$/, '');
          logger.debug({ templateFile: newfile }, 'generating template file');
          const reader = fs.createReadStream(path.resolve(dir, file));
          const writer =
            fs.createWriteStream(path.resolve(process.cwd(), newfile));
          reader.pipe(writer)
            .on('finish', resolve)
            .on('error', reject);
        })
      )
    );
  }).then(() => logger.info({ template }, 'initialisation complete'));
};
