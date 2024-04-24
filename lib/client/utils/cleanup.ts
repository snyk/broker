import { readFileSync, writeFileSync } from 'node:fs';

export const cleanUpUniversalFile = (
  universalCfgFilePath = `${__dirname}/../../../../config.universal.json`,
) => {
  const fileToCleanUpBuffer = readFileSync(universalCfgFilePath);
  const fileToCleanUp = JSON.parse(fileToCleanUpBuffer.toString());
  delete fileToCleanUp['CONNECTIONS'];
  writeFileSync(universalCfgFilePath, JSON.stringify(fileToCleanUp));
};
