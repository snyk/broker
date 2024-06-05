import BrokerPlugin from '../abstractBrokerPlugin';

export class Plugin extends BrokerPlugin {
  pluginCode = 'CONTAINER_REGISTRY_CREDENTIALS_FORMAT_PLUGIN';
  pluginName = 'Container Registry Credentials Formatting Plugin';
  description =
    'Plugin that formats the container registry credentials for the targeted registry type';
  version = '0.1';
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
    let credentials;
    switch (connectionConfiguration.type) {
      case 'ecr':
        if (
          !connectionConfiguration.CR_ROLE_ARN ||
          !connectionConfiguration.CR_REGION ||
          !connectionConfiguration.CR_EXTERNAL_ID
        ) {
          throw new Error(
            `Plugin ${this.pluginCode} startup failure: ${connectionConfiguration.type} requires the following parameters: CR_ROLE_ARN, CR_REGION and CR_EXTERNAL_ID.`,
          );
        }
        credentials = `{"type":"${connectionConfiguration.type}","roleArn":"${connectionConfiguration.CR_ROLE_ARN}","extra":{"region":"${connectionConfiguration.CR_REGION}","externalId":"${connectionConfiguration.CR_EXTERNAL_ID}"}}\n`;
        break;
      case 'digitalocean-cr':
        if (!connectionConfiguration.CR_TOKEN) {
          throw new Error(
            `Plugin ${this.pluginCode} startup failure: ${connectionConfiguration.type} requires the following parameters: CR_TOKEN.`,
          );
        }
        credentials = `{"type":"${connectionConfiguration.type}", "username":"${connectionConfiguration.CR_TOKEN}", "password":"${connectionConfiguration.CR_TOKEN}", "registryBase":"${connectionConfiguration.CR_BASE}"}\n`;
        break;
      default:
        if (
          !connectionConfiguration.CR_USERNAME ||
          !connectionConfiguration.CR_PASSWORD
        ) {
          throw new Error(
            `Plugin ${this.pluginCode} startup failure: ${connectionConfiguration.type} requires the following parameters: CR_USERNAME,CR_PASSWORD.`,
          );
        }
        credentials = `{"type":"${connectionConfiguration.type}", "username":"${connectionConfiguration.CR_USERNAME}", "password":"${connectionConfiguration.CR_PASSWORD}", "registryBase":"${connectionConfiguration.CR_BASE}"}\n`;
    }
    connectionConfiguration.CR_CREDENTIALS =
      Buffer.from(credentials).toString('base64');
    connectionConfiguration.craCompatible = true;

    if (connectionConfiguration.BROKER_CLIENT_VALIDATION_URL) {
      connectionConfiguration.BROKER_CLIENT_VALIDATION_URL =
        connectionConfiguration.CR_CREDENTIALS;
    }
  }
}
