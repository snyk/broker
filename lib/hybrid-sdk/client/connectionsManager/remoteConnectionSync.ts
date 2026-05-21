import { findProjectRoot } from '../../common/config/config';
import { LoadedClientOpts } from '../../common/types/options';
import { log as logger } from '../../../logs/logger';
import { isShuttingDown } from '../../common/utils/signals';
import { reloadConfig } from '../config/configHelpers';
import { retrieveConnectionsForDeployment } from '../config/remoteConfig';
import { validateUniversalConnectionsRemoteConfig } from './validator';

export const retrieveAndLoadRemoteConfigSync = async (
  clientOpts: LoadedClientOpts,
): Promise<void> => {
  if (isShuttingDown()) {
    return;
  }
  try {
    const universalFilePath = `${findProjectRoot(
      __dirname,
    )}/config.universal.json`;
    await retrieveConnectionsForDeployment(clientOpts, universalFilePath);
    validateUniversalConnectionsRemoteConfig(universalFilePath);
    await reloadConfig(clientOpts);
  } catch (err) {
    logger.warn({ err }, 'Remote config sync failed; will retry on next cycle');
  }
};
