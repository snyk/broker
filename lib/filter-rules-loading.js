const path = require('path');
const yaml = require('js-yaml');
const fs = require('fs');

module.exports = (acceptFilename = '', folderLocation = '') => {
  let filters = {};
  if (acceptFilename) {
    const acceptLocation = path.resolve(
      folderLocation ? folderLocation : process.cwd(),
      acceptFilename,
    );

    filters = yaml.safeLoad(fs.readFileSync(acceptLocation, 'utf8'));
  }
  return filters;
};
