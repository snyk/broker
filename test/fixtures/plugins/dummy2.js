import BrokerPlugin from '../../../lib/hybrid-sdk/client/brokerClientPlugins/abstractBrokerPlugin';

export class Plugin extends BrokerPlugin {
  pluginCode = 'DUMMY2';
  pluginName = 'Dummy Plugin 2';
  description = `
    dummy plugin 2
    `;
  version = '0.1';
  applicableBrokerTypes = ['dummy2'];

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
      'NEW_VAR_ADDED_TO_CONNECTION_2',
      'access-token',
    );
  }
}
