import BrokerPlugin from '../../../lib/hybrid-sdk/client/brokerClientPlugins/abstractBrokerPlugin';

export class Plugin extends BrokerPlugin {
  pluginCode = 'DUMMY-CONTEXT';
  pluginName = 'Dummy Context Plugin';
  description = `
    dummy plugin
    `;
  version = '0.1';
  applicableBrokerTypes = ['dummy-context'];

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

  async startUpContext(connectionKey, contextId, connectionConfig) {
    this.logger.info(
      { plugin: this.pluginName, contextId },
      'Running Context Startup',
    );
    this.logger.info(
      { config: connectionConfig },
      'Connection Config passed to the plugin',
    );
    this.setPluginConfigParamForConnectionContext(
      connectionKey,
      contextId,
      'NEW_VAR_ADDED_TO_CONNECTION',
      'access-token-context',
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
