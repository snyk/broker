import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { findProjectRoot } from '../../common/config/config';

export const cleanUpUniversalFile = (
  universalCfgFilePath = `${__dirname}/../../../../config.universal.json`,
) => {
  if (process.env.NO_UNIVERSAL_FILE == 'true') {
    unlinkSync(`${findProjectRoot(__dirname)}/config.universal.json`);
  } else {
    const fileToCleanUpBuffer = readFileSync(universalCfgFilePath);
    const fileToCleanUp = JSON.parse(fileToCleanUpBuffer.toString());
    delete fileToCleanUp['CONNECTIONS'];
    writeFileSync(universalCfgFilePath, JSON.stringify(fileToCleanUp));
  }
};
