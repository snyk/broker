// import { PostFilterPreparedRequest } from '../../../common/relay/prepareRequest';
import BrokerPlugin from '../abstractBrokerPlugin';

export class Plugin extends BrokerPlugin {
  // Plugin Code and Name must be unique across all plugins.
  pluginCode = 'GITHUB_SERVER_APP';
  pluginName = 'Github Server App Authentication Plugin';
  description = `
    Plugin to retrieve and manage credentials for Brokered Github Server App installs
    `;
  version = '0.1';
  applicableBrokerTypes = ['github-server-app']; // Must match broker types

  // Provide a way to include specific conditional logic to execute
  isPluginActive(): boolean {
    // if (this.brokerClientConfiguration['XYZ']) {
    //   this.logger.debug({ plugin: this.pluginName }, 'Disabling plugin');
    //   return false;
    // }
    return true;
  }

  // Function running upon broker client startup
  // Useful for credentials retrieval, initial setup, etc...
  async startUp(connectionConfig): Promise<void> {
    this.logger.info({ plugin: this.pluginName }, 'Running Startup');
    this.logger.info(
      { config: connectionConfig },
      'Connection Config passed to the plugin',
    );
    // const data = {
    //   install_id: connectionConfig.GITHUB_APP_INSTALL_ID,
    //   client_id: connectionConfig.GITHUB_CLIENT_ID,
    //   client_secret: connectionConfig.GITHUB_CLIENT_SECRET,
    // };
    // const formData = new URLSearchParams(data);

    // this.request = {
    //   url: `https://${connectionConfig.GITHUB_API}/oauth/path`,
    //   headers: {
    //     'Content-Type': 'application/x-www-form-urlencoded',
    //   },
    //   method: 'POST',
    //   body: formData.toString(),
    // };
    // const response = await this.makeRequestToDownstream(this.request);
    // if (response.statusCode && response.statusCode > 299) {
    //   throw Error('Error making request');
    // }
  }

  // Hook to run pre requests operations - Optional. Uncomment to enable
  // async preRequest(
  //   connectionConfiguration: Record<string, any>,
  //   postFilterPreparedRequest:PostFilterPreparedRequest,
  // ) {
  //   this.logger.debug({ plugin: this.pluginName, connection: connectionConfiguration }, 'Running prerequest plugin');
  //   return postFilterPreparedRequest;
  // }
}
