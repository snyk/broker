import BrokerPlugin from '../../../lib/client/brokerClientPlugins/abstractBrokerPlugin';

export class Plugin extends BrokerPlugin {
  pluginCode = 'DUMMYMULTI';
  pluginName = 'Dummy Plugin Multi';
  description = `
    dummy plugin multi 1 2
    `;
  version = '0.1';
  applicableBrokerTypes = ['dummy-multi-1', 'dummy-multi-2'];

  isPluginActive() {
    if (this.brokerClientConfiguration.DISABLE_DUMMY_PLUGIN) {
      this.logger.debug({ plugin: this.pluginName }, 'Disabling plugin');
      return false;
    }
    return true;
  }
  async startUp(connectionConfig) {
    this.logger.info({ plugin: this.pluginName }, 'Running Startup');
    this.logger.info(
      { config: connectionConfig },
      'Connection Config passed to the plugin',
    );
    connectionConfig['NEW_VAR_ADDED_TO_CONNECTION'] = 'access-token';
  }

  async preRequest(connectionConfiguration, postFilterPreparedRequest) {
    this.logger.info({ plugin: this.pluginName }, 'Running prerequest plugin');
    const customizedRequest = postFilterPreparedRequest;
    customizedRequest.body['NEW_VAR_ADDED_TO_CONNECTION'] =
      connectionConfiguration['NEW_VAR_ADDED_TO_CONNECTION'];
    return customizedRequest;
  }
}
