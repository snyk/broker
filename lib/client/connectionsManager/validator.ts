import { readFileSync, writeFileSync } from 'node:fs';
import { log as logger } from '../../logs/logger';
export const validateUniversalConnectionsRemoteConfig = (
  universalCfgFilePath: string,
) => {
  const universalConfigFileBuffer = readFileSync(universalCfgFilePath);
  const universalConfigFile = JSON.parse(
    universalConfigFileBuffer.toString() ?? { CONNECTIONS: {} },
  );

  const connections = universalConfigFile['CONNECTIONS'];
  const connectionsKeys = Object.keys(connections);
  for (let i = 0; i < connectionsKeys.length; i++) {
    const values = Object.values(
      connections[`${connectionsKeys[i]}`],
    ) as Array<string>;
    const placeHolderValues =
      values.length > 0 ? values.filter((x) => x && x.startsWith('${')) : [];
    for (let j = 0; j < placeHolderValues.length; j++) {
      const envVarName = placeHolderValues[j]
        .replace('${', '')
        .replace('}', '');
      if (
        process.env[envVarName] &&
        process.env[envVarName] != 'placeholderValue'
      ) {
        break;
      }
      process.env[envVarName] = 'placeholderValue';
      connections[`${connectionsKeys[i]}`].isDisabled = true;
      logger.error(
        { connection: connectionsKeys[i] },
        `Connection is missing environment variable value ${envVarName}. Connection is disabled till value is provided. Restart broker once added.`,
      );
    }
  }

  universalConfigFile['CONNECTIONS'] = connections;
  writeFileSync(universalCfgFilePath, JSON.stringify(universalConfigFile));
};
