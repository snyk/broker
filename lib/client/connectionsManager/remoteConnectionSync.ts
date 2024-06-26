import { findProjectRoot } from '../../common/config/config';
import { LoadedClientOpts } from '../../common/types/options';
import { reloadConfig } from '../config/configHelpers';
import { retrieveConnectionsForDeployment } from '../config/remoteConfig';
import { validateUniversalConnectionsRemoteConfig } from './validator';

export const retrieveAndLoadRemoteConfigSync = async (
  clientOpts: LoadedClientOpts,
): Promise<void> => {
  await retrieveConnectionsForDeployment(
    clientOpts,
    `${findProjectRoot(__dirname)}/config.universal.json`,
  );
  validateUniversalConnectionsRemoteConfig(
    `${findProjectRoot(__dirname)}/config.universal.json`,
  );
  await reloadConfig(clientOpts);
};
