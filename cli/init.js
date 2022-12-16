const { promises: fsp, createReadStream, createWriteStream } = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../client-templates/');
const logger = require('../lib/log');

module.exports = async (templateName) => {
  if (!templateName) {
    throw new Error('init requires a template name');
  }

  const templateDir = path.resolve(root, templateName);

  const rootFiles = await fsp.readdir(root);

  if (!rootFiles.includes(templateName)) {
    throw new Error(`${templateName} is an invalid template name`);
  }

  const templateFiles = await fsp.readdir(templateDir);

  // check if any of the files exist on disk already, and if so, abort.
  const filesWithAccessData = await Promise.all(
    templateFiles.map(async (file) => {
      // file = file.replace(/\.sample$/, '');
      console.log(file)

      try {
        await fsp.access(file);

        return { file, exists: true };
      } catch (error) {
        return { file, exists: false };
      }
    }),
  );

  const existingFiles = filesWithAccessData.filter(({ exists }) => exists);

  if (existingFiles.length) {
    const existingFileNames = existingFiles.map(({ file }) => file).join(' ');

    throw new Error(
      `The following file(s) exist and cannot be overwritten, please move them: ${existingFileNames}`,
    );
  }

  await Promise.all(
    templateFiles.map(
      (file) =>
        new Promise((resolve, reject) => {
          const newfile = file.replace(/\.sample$/, '');
          logger.debug({ templateFile: newfile }, 'generating template file');
          const reader = createReadStream(path.resolve(templateDir, file));
          const writer = createWriteStream(
            path.resolve(process.cwd(), newfile),
          );
          reader.pipe(writer).on('finish', resolve).on('error', reject);
        }),
    ),
  );

  logger.info({ templateName }, 'initialisation complete');
};
