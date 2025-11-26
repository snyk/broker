import { getConfig } from './common/config/config';
import {
  getConfigForIdentifier,
  getConfigForType,
  overloadConfigWithConnectionSpecificConfig,
} from './common/config/universal';
import { Rule } from './common/types/filter';
import authHeader from './common/utils/auth-header';
import { replace } from './common/utils/replace-vars';
import tryJSONParse from './common/utils/try-json-parse';
import undefsafe from 'undefsafe';
import { log as logger } from '../logs/logger';

export const getInterpolatedRequest = (
  connectionIdentifier: string | null,
  matchedFilterRule: Rule,
  payload,
  logContext: {
    bodyVarsSubstitution?: string[];
    headerVarsSubstitution?: string[];
  },
  contextConfig,
  requestOrigin?: string,
) => {
  const config = { ...contextConfig, ...getConfig() };
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
    const contextId = payload.headers['x-snyk-broker-context-id'] ?? null;
    if (contextId) {
      logger.debug(
        { url: payload.url, connectionIdentifier, contextId },
        `Using specific context for request.`,
      );
    }
    localConfig = overloadConfigWithConnectionSpecificConfig(
      connectionIdentifier,
      localConfig,
      contextId,
    );
  }

  const origin = replace(baseOrigin, localConfig);

  // if the request is all good - and at this point it is, we'll check
  // whether we want to do variable substitution on the body
  //
  // Variable substitution - for those who forgot - is substituting a part
  // of a given string (e.g. "${SOME_ENV_VAR}/rest/of/string")
  // with an env var of the same name (SOME_ENV_VAR).
  // This is used (for example) to substitute the snyk url
  // with the broker's url when defining the target for an incoming webhook.
  if (requestOrigin === 'downstream') {
    if (!config.disableBodyVarsSubstitution && payload.body) {
      const parsedBody = tryJSONParse(payload.body);
      if (parsedBody.BROKER_VAR_SUB) {
        logContext.bodyVarsSubstitution = parsedBody.BROKER_VAR_SUB;
        for (const path of parsedBody.BROKER_VAR_SUB) {
          let source = undefsafe(parsedBody, path); // get the value
          source = replace(
            source,
            config.universalBrokerEnabled
              ? getConfigForIdentifier(connectionIdentifier!, config)
              : config,
          ); // replace the variables
          undefsafe(parsedBody, path, source); // put it back in
        }
        //Remove the BROKER_VAR_SUB for the request body
        delete parsedBody.BROKER_VAR_SUB;
        payload.body = JSON.stringify(parsedBody);
      }
    }

    if (
      !config.disableHeaderVarsSubstitution &&
      payload.headers &&
      payload.headers['x-broker-var-sub']
    ) {
      // check whether we want to do variable substitution on the headers
      logContext.headerVarsSubstitution = payload.headers['x-broker-var-sub'];
      for (const path of payload.headers['x-broker-var-sub'].split(',')) {
        let source = undefsafe(payload.headers, path.trim()); // get the value
        source = replace(
          source,
          config.universalBrokerEnabled
            ? getConfigForIdentifier(connectionIdentifier!, config)
            : config,
        ); // replace the variables
        undefsafe(payload.headers, path.trim(), source); // put it back in
      }
    }
  }
  return {
    url: origin + payload.url,
    auth: auth && authHeader(auth, localConfig),
  };
};
