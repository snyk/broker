import { PostFilterPreparedRequest } from '../../../broker-workload/prepareRequest';
import {
  getPluginsConfig,
  getPluginConfigByConnectionKey,
  getPluginConfigParamByConnectionKey,
  PluginConnectionConfig,
  getPluginConfigParamByConnectionKeyAndContextId,
  setPluginConfigParamByConnectionKeyAndContextId,
  setPluginConfigParamByConnectionKey,
} from '../../common/config/pluginsConfig';
import { HttpResponse, makeRequestToDownstream } from '../../http/request';
import { log as logger } from '../../../logs/logger';
import { redactConfig } from '../../../logs/redact';

export default abstract class BrokerPlugin {
  abstract pluginCode: string;
  abstract pluginName: string;
  abstract description: string;
  abstract version: string;
  abstract applicableBrokerTypes: Array<string>;
  logger;
  brokerClientConfiguration: Record<string, any>;
  pluginsConfig: Record<string, any>;

  makeRequestToDownstream: (
    req: PostFilterPreparedRequest,
    retries?: any,
  ) => Promise<HttpResponse>;
  request?: PostFilterPreparedRequest;

  constructor(brokerClientCfg: Record<string, any>) {
    this.logger = logger;
    this.brokerClientConfiguration = brokerClientCfg;
    this.makeRequestToDownstream = makeRequestToDownstream;
    this.pluginsConfig = getPluginsConfig();
  }

  getApplicableTypes(): Array<string> {
    return this.applicableBrokerTypes.filter((type) =>
      this.brokerClientConfiguration.supportedBrokerTypes.includes(type),
    );
  }

  isDisabled(config): boolean {
    let isDisabled = false;
    if (config[`DISABLE_${this.pluginCode}_PLUGIN`]) {
      logger.info({ plugin: this.pluginName }, `Plugin disabled.`);
      isDisabled = true;
    }
    return isDisabled;
  }

  getPluginConfig() {
    return getPluginsConfig();
  }

  getPluginConfigForConnection(connectionKey: string) {
    return getPluginConfigByConnectionKey(connectionKey);
  }

  getPluginConfigParamForConnection(connectionKey: string, paramName: string) {
    return getPluginConfigParamByConnectionKey(connectionKey, paramName);
  }

  getPluginConfigParamForConnectionContext(
    connectionKey: string,
    contextId: string,
    paramName: string,
  ) {
    return getPluginConfigParamByConnectionKeyAndContextId(
      connectionKey,
      contextId,
      paramName,
    );
  }

  setPluginConfigParamForConnection(
    connectionKey: string,
    paramName: string,
    value: any,
  ) {
    setPluginConfigParamByConnectionKey(connectionKey, paramName, value);
  }

  setPluginConfigParamForConnectionContext(
    connectionKey: string,
    contextId: string,
    paramName: string,
    value: any,
  ) {
    setPluginConfigParamByConnectionKeyAndContextId(
      connectionKey,
      contextId,
      paramName,
      value,
    );
  }

  abstract isPluginActive(): boolean;

  abstract startUp(
    connectionKey: string,
    connectionConfiguration: Record<string, any>,
    pluginConfig?: PluginConnectionConfig,
  ): Promise<void>;

  // Important Note:
  // - connectionConfiguration is a shallow copy from the various items compiled in getConfigForIdentifier
  // - connectionConfiguration.contexts[contextId] still holds a reference to the main config object
  // therefore "writing" in the main config object
  // While connectionConfiguration['test']='value' does not get persisted
  // connectionConfiguration.contexts[contextId]['test]='value' does.

  // Very Important Note:
  // - Plugins should store/mutate pluginsConfig object (getPluginsConfig())
  // - Data stored should be stored in plugins config object
  // - General config and connections specifics, including contexts, should not be mutated
  // - Plugins conf is reserved for plugins, whereas config can be reloaded at anytime
  abstract startUpContext(
    connectionKey: string,
    contextId: string,
    connectionConfiguration: Record<string, any>,
    pluginConfig: PluginConnectionConfig,
  ): Promise<void>;

  async preRequest(
    connectionConfiguration: Record<string, any>,
    postFilterPreparedRequest: PostFilterPreparedRequest,
    pluginConfig?: PluginConnectionConfig,
  ): Promise<PostFilterPreparedRequest> {
    // Guard the redactConfig calls — preRequest is per-request hot path, and
    // arguments evaluate before the trace call short-circuits internally.
    if (logger.trace()) {
      logger.trace(
        {
          connectionConfig: redactConfig(connectionConfiguration),
          pluginsConfig: redactConfig(pluginConfig),
        },
        'Abstract preRequest Plugin',
      );
    }
    return postFilterPreparedRequest;
  }
}
