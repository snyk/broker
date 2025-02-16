import { getConfig } from '../common/config/config';
import {
  getConfigForType,
  overloadConfigWithConnectionSpecificConfig,
} from '../common/config/universal';
import { Rule } from '../common/types/filter';
import authHeader from '../common/utils/auth-header';
import { replace } from '../common/utils/replace-vars';

export const getInterpolatedRequest = (
  connectionIdentifier: string | null,
  matchedFilterRule: Rule,
  url: string,
) => {
  const config = getConfig();
  const { origin: baseOrigin, auth, connectionType } = matchedFilterRule;
  // load config from config.default.json based on type and config.universal.json based on token
  let localConfig =
    connectionType && config.universalBrokerEnabled
      ? Object.assign({}, getConfigForType(connectionType), config)
      : config;
  if (
    // config?.brokerType === 'client' &&  // redundant as universal broker is client only
    config?.universalBrokerEnabled &&
    connectionIdentifier
  ) {
    localConfig = overloadConfigWithConnectionSpecificConfig(
      connectionIdentifier,
      localConfig,
    );
  }
  const origin = replace(baseOrigin, localConfig);
  return {
    url: origin + url,
    auth: auth && authHeader(auth, localConfig),
  };
};
