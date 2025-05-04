import { PluginConnectionConfig } from '../../../common/config/pluginsConfig';
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
  async startUp(
    connectionKey: string,
    connectionConfiguration: Record<string, any>,
    // pluginConfig: PluginConnectionConfig,
  ): Promise<void> {
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
    const credentials = Buffer.from(
      this._getCredentials(connectionConfiguration),
    ).toString('base64');
    this.setPluginConfigParamForConnection(
      connectionKey,
      'CR_CREDENTIALS',
      credentials,
    );
    this.setPluginConfigParamForConnection(
      connectionKey,
      'craCompatible',
      true,
    );

    if (connectionConfiguration.BROKER_CLIENT_VALIDATION_URL) {
      this.setPluginConfigParamForConnection(
        connectionKey,
        'BROKER_CLIENT_VALIDATION_URL',
        credentials,
      );
    }
  }
  async startUpContext(
    connectionKey: string,
    contextId: string,
    connectionConfiguration: Record<string, any>,
    pluginConfig: PluginConnectionConfig,
  ): Promise<void> {
    this.logger.debug({ contextId, connectionConfiguration, pluginConfig });
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
    const credentials = Buffer.from(
      this._getCredentials(connectionConfiguration),
    ).toString('base64');
    this.setPluginConfigParamForConnectionContext(
      connectionKey,
      contextId,
      'CR_CREDENTIALS',
      credentials,
    );
    this.setPluginConfigParamForConnectionContext(
      connectionKey,
      contextId,
      'craCompatible',
      true,
    );
    if (connectionConfiguration.BROKER_CLIENT_VALIDATION_URL) {
      this.setPluginConfigParamForConnectionContext(
        connectionKey,
        contextId,
        'BROKER_CLIENT_VALIDATION_URL',
        credentials,
      );
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
