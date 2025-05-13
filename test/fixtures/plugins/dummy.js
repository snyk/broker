import BrokerPlugin from '../../../lib/hybrid-sdk/client/brokerClientPlugins/abstractBrokerPlugin';

export class Plugin extends BrokerPlugin {
  pluginCode = 'DUMMY';
  pluginName = 'Dummy Plugin';
  description = `
    dummy plugin
    `;
  version = '0.1';
  applicableBrokerTypes = ['dummy'];

  isPluginActive() {
    if (this.brokerClientConfiguration.DISABLE_DUMMY_PLUGIN) {
      this.logger.debug({ plugin: this.pluginName }, 'Disabling plugin');
      return false;
    }
    return true;
  }
  async startUp(connectionKey, connectionConfig) {
    this.logger.info({ plugin: this.pluginName }, 'Running Startup');
    this.logger.info(
      { config: connectionConfig },
      'Connection Config passed to the plugin',
    );
    this.setPluginConfigParamForConnection(
      connectionKey,
      'NEW_VAR_ADDED_TO_CONNECTION',
      'access-token',
    );
  }

  async preRequest(connectionConfiguration, postFilterPreparedRequest) {
    this.logger.info({ plugin: this.pluginName }, 'Running prerequest plugin');
    const customizedRequest = postFilterPreparedRequest;
    customizedRequest.body['NEW_VAR_ADDED_TO_CONNECTION'] =
      connectionConfiguration['NEW_VAR_ADDED_TO_CONNECTION'];
    return customizedRequest;
  }
}
