import {
  HttpResponse,
  makeRequestToDownstream,
} from '../../common/http/request';
import { PostFilterPreparedRequest } from '../../common/relay/prepareRequest';
import { log as logger } from '../../logs/logger';

export default abstract class BrokerPlugin {
  abstract pluginCode: string;
  abstract pluginName: string;
  abstract description: string;
  abstract version: string;
  abstract applicableBrokerTypes: Array<string>;
  logger;
  brokerClientConfiguration: Record<string, any>;
  makeRequestToDownstream: (
    req: PostFilterPreparedRequest,
    retries?: any,
  ) => Promise<HttpResponse>;
  request?: PostFilterPreparedRequest;

  constructor(brokerClientCfg: Record<string, any>) {
    this.logger = logger;
    this.brokerClientConfiguration = brokerClientCfg;
    this.makeRequestToDownstream = makeRequestToDownstream;
  }

  getApplicableTypes(): Array<string> {
    const applicableTypes: Array<string> = [];
    if (
      this.applicableBrokerTypes.every((type) =>
        this.brokerClientConfiguration.supportedBrokerTypes.includes(type),
      )
    ) {
      applicableTypes.push(...this.applicableBrokerTypes);
    }
    return applicableTypes;
  }
  isDisabled(config): boolean {
    let isDisabled = false;
    if (config[`DISABLE_${this.pluginCode}_PLUGIN`]) {
      logger.info({ plugin: this.pluginName }, `Plugin disabled`);
      isDisabled = true;
    }
    return isDisabled;
  }
  abstract isPluginActive(): boolean;

  abstract startUp(connectionConfiguration: Record<string, any>): Promise<void>;

  async preRequest(
    connectionConfiguration: Record<string, any>,
    postFilterPreparedRequest: PostFilterPreparedRequest,
  ): Promise<PostFilterPreparedRequest> {
    return postFilterPreparedRequest;
  }
}
