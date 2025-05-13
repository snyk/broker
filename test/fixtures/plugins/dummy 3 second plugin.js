import BrokerPlugin from '../../../lib/hybrid-sdk/client/brokerClientPlugins/abstractBrokerPlugin';

export class Plugin extends BrokerPlugin {
  pluginCode = 'SECONDDUMMY3';
  pluginName = 'Second Dummy 3 Plugin';
  description = `
    Second dummy 3 plugin
    `;
  version = '0.1';
  applicableBrokerTypes = ['dummy3'];

  isPluginActive() {
    if (this.brokerClientConfiguration.DISABLE_SECOND_DUMMY_3_PLUGIN) {
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
      'NEW_VAR_ADDED_TO_CONNECTION_FROM_SECOND_DUMMY3_PLUGIN',
      'access-token-dummy3',
    );
  }

  async preRequest(connectionConfiguration, postFilterPreparedRequest) {
    this.logger.info({ plugin: this.pluginName }, 'Running prerequest plugin');
    const customizedRequest = postFilterPreparedRequest;
    customizedRequest.body[
      'NEW_VAR_ADDED_TO_CONNECTION_FROM_SECOND_DUMMY3_PLUGIN'
    ] =
      connectionConfiguration[
        'NEW_VAR_ADDED_TO_CONNECTION_FROM_SECOND_DUMMY3_PLUGIN'
      ];
    return customizedRequest;
  }
}
