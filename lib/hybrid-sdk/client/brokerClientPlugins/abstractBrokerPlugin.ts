import { PostFilterPreparedRequest } from '../../../broker-workload/prepareRequest';
import {
  getPluginsConfig,
  setPluginConfig,
  setPluginConfigSubKey,
} from '../../common/config/pluginsConfig';
import { HttpResponse, makeRequestToDownstream } from '../../http/request';
import { log as logger } from '../../../logs/logger';

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

  getPluginConfigSubKey(key: string, subKey: string) {
    return getPluginsConfig()[key][subKey];
  }

  setPluginConfigKey(key: string, value: any) {
    setPluginConfig(key, value);
  }
  setPluginConfigSubKey(key: string, subKey: string, value: any) {
    setPluginConfigSubKey(key, subKey, value);
  }

  abstract isPluginActive(): boolean;

  abstract startUp(
    connectionConfiguration: Record<string, any>,
    pluginsConfig?: Record<any, string>,
  ): Promise<void>;

  abstract startUpContext(
    _contextId: string,
    _connectionConfiguration: Record<string, any>,
    _pluginsConfig: Record<any, string>,
  ): Promise<void>;

  async preRequest(
    connectionConfiguration: Record<string, any>,
    postFilterPreparedRequest: PostFilterPreparedRequest,
    pluginsConfig?: Record<any, string>,
  ): Promise<PostFilterPreparedRequest> {
    logger.trace(
      {
        connectionConfig: connectionConfiguration,
        pluginsConfig: pluginsConfig,
      },
      'Abstract preRequest Plugin',
    );
    return postFilterPreparedRequest;
  }
}
