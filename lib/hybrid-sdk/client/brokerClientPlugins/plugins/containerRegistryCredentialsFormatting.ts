import BrokerPlugin from '../abstractBrokerPlugin';

export class Plugin extends BrokerPlugin {
  pluginCode = 'CONTAINER_REGISTRY_CREDENTIALS_FORMAT_PLUGIN';
  pluginName = 'Container Registry Credentials Formatting Plugin';
  description =
    'Plugin that formats the container registry credentials for the targeted registry type';
  version = '0.2';
  applicableBrokerTypes = [
    'docker-hub',
    'ecr',
    'acr',
    'gcr',
    'artifactory-cr',
    'harbor-cr',
    'quay-cr',
    'github-cr',
    'nexus-cr',
    'digitalocean-cr',
    'gitlab-cr',
    'google-artifact-cr',
  ];
  isPluginActive(): boolean {
    return true;
  }
  async startUp(connectionConfiguration: Record<string, any>): Promise<void> {
    if (
      !connectionConfiguration.type ||
      !this.applicableBrokerTypes.includes(connectionConfiguration.type)
    ) {
      throw new Error(
        `Plugin ${
          this.pluginCode
        } startup failure: unknown container registry type: ${
          connectionConfiguration.type ?? '<not provided>'
        }.`,
      );
    }

    connectionConfiguration.CR_CREDENTIALS = Buffer.from(
      this._getCredentials(connectionConfiguration),
    ).toString('base64');
    connectionConfiguration.craCompatible = true;

    if (connectionConfiguration.BROKER_CLIENT_VALIDATION_URL) {
      connectionConfiguration.BROKER_CLIENT_VALIDATION_URL =
        connectionConfiguration.CR_CREDENTIALS;
    }
  }
  async startUpContext(
    contextId: string,
    connectionConfiguration: Record<string, any>,
    pluginsConfig: Record<any, string>,
  ): Promise<void> {
    this.logger.debug({ contextId, connectionConfiguration, pluginsConfig });
    if (
      !connectionConfiguration.type ||
      !this.applicableBrokerTypes.includes(connectionConfiguration.type)
    ) {
      throw new Error(
        `Plugin ${
          this.pluginCode
        } startup failure: unknown container registry type: ${
          connectionConfiguration.type ?? '<not provided>'
        }.`,
      );
    }
    // Important Note:
    // - connectionConfiguration is a shallow copy from the various items compiled in getConfigForIdentifier
    // - connectionConfiguration.contexts[contextId] still holds a reference to the main config object
    // therefore "writing" in the main config object
    // While connectionConfiguration['test']='value' does not get persisted
    // connectionConfiguration.contexts[contextId]['test]='value' does.
    connectionConfiguration.contexts[contextId].CR_CREDENTIALS = Buffer.from(
      this._getCredentials(connectionConfiguration),
    ).toString('base64');
    connectionConfiguration.contexts[contextId].craCompatible = true;

    if (connectionConfiguration.BROKER_CLIENT_VALIDATION_URL) {
      connectionConfiguration.BROKER_CLIENT_VALIDATION_URL =
        connectionConfiguration.contexts[contextId].CR_CREDENTIALS;
    }
  }
  _getCredentials(config) {
    let credentials;
    switch (config.type) {
      case 'ecr':
        if (
          !config.CR_ROLE_ARN ||
          !config.CR_REGION ||
          !config.CR_EXTERNAL_ID
        ) {
          throw new Error(
            `Plugin ${this.pluginCode} startup failure: ${config.type} requires the following parameters: CR_ROLE_ARN, CR_REGION and CR_EXTERNAL_ID.`,
          );
        }
        credentials = `{"type":"${config.type}","roleArn":"${config.CR_ROLE_ARN}","extra":{"region":"${config.CR_REGION}","externalId":"${config.CR_EXTERNAL_ID}"}}\n`;
        break;
      case 'digitalocean-cr':
        if (!config.CR_TOKEN) {
          throw new Error(
            `Plugin ${this.pluginCode} startup failure: ${config.type} requires the following parameters: CR_TOKEN.`,
          );
        }
        credentials = `{"type":"${config.type}", "username":"${config.CR_TOKEN}", "password":"${config.CR_TOKEN}", "registryBase":"${config.CR_BASE}"}\n`;
        break;
      default:
        if (!config.CR_USERNAME || !config.CR_PASSWORD) {
          throw new Error(
            `Plugin ${this.pluginCode} startup failure: ${config.type} requires the following parameters: CR_USERNAME,CR_PASSWORD.`,
          );
        }
        credentials = `{"type":"${config.type}", "username":"${config.CR_USERNAME}", "password":"${config.CR_PASSWORD}", "registryBase":"${config.CR_BASE}"}\n`;
    }
    return credentials;
  }
}
