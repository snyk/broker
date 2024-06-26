import { ConfigMetadata } from '../types/client';
import { Config } from '../types/config';
import { log as logger } from '../../logs/logger';
import {
  CONFIGURATION,
  getConfig,
  loadBrokerConfig,
} from '../../common/config/config';

export const reloadConfig = async (clientOpts) => {
  // Reload config with connection
  await loadBrokerConfig();
  const globalConfig = { config: getConfig() };
  clientOpts.config = Object.assign(
    {},
    clientOpts.config,
    globalConfig.config,
  ) as Record<string, any> as CONFIGURATION;
};

export const getClientConfigMetadata = (
  clientConfig: Record<string, any>,
): ConfigMetadata => {
  const configMetadata: ConfigMetadata = {
    haMode: highAvailabilityModeEnabled(clientConfig),
    debugMode: clientConfig.logLevel === 'debug' ? true : false,
    bodyLogMode: clientConfig.logEnableBody ? true : false,
    credPooling: isCredPoolingUsed(clientConfig),
    privateCa: clientConfig.nodeExtraCaCert ? true : false,
    tlsReject:
      parseInt(clientConfig.nodeTlsRejectUnauthorized) === 0 ? true : false,
    proxy: clientConfig.httpProxy || clientConfig.httpsProxy ? true : false,
    customAccept: clientConfig.accept ? true : false,
    insecureDownstream: clientConfig.insecureDownstream ? true : false,
    universalBroker: clientConfig.universalBrokerEnabled ? true : false,
  };
  return configMetadata;
};

const isCredPoolingUsed = (config: Record<string, any>): boolean => {
  for (const key in config) {
    if (config.hasOwnProperty(key) && key.includes('_POOL')) {
      return true; // Found a key containing '_POOL'
    }
  }
  return false;
};

export function highAvailabilityModeEnabled(config: any): boolean {
  // high availability mode is disabled per default
  let highAvailabilityModeEnabled = false;
  const highAvailabilityModeEnabledValue = (config as Config)
    .BROKER_HA_MODE_ENABLED;

  if (typeof highAvailabilityModeEnabledValue !== 'undefined') {
    highAvailabilityModeEnabled =
      highAvailabilityModeEnabledValue.toLowerCase() === 'true' ||
      highAvailabilityModeEnabledValue.toLowerCase() === 'yes';
  }

  logger.info({ enabled: highAvailabilityModeEnabled }, 'checking for HA mode');

  return highAvailabilityModeEnabled;
}
