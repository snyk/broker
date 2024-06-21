// import { PostFilterPreparedRequest } from '../../../common/relay/prepareRequest';
import { existsSync, readFileSync } from 'node:fs';
import BrokerPlugin from '../abstractBrokerPlugin';
import { createPrivateKey } from 'node:crypto';
import { sign } from 'jsonwebtoken';
import { PostFilterPreparedRequest } from '../../../common/relay/prepareRequest';
import { makeRequestToDownstream } from '../../../common/http/request';
export class Plugin extends BrokerPlugin {
  // Plugin Code and Name must be unique across all plugins.
  pluginCode = 'GITHUB_SERVER_APP_PLUGIN';
  pluginName = 'Github Server App Authentication Plugin';
  description = `
    Plugin to retrieve and manage credentials for Brokered Github Server App installs
    `;
  version = '0.1';
  applicableBrokerTypes = ['github-server-app']; // Must match broker types
  JWT_TTL = 10 * 60 * 1000;

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
    try {
      this.logger.info({ plugin: this.pluginName }, 'Running Startup');
      this.logger.debug(
        { plugin: this.pluginCode, config: connectionConfig },
        'Connection Config passed to the plugin',
      );
      if (
        connectionConfig &&
        (!connectionConfig.GITHUB_APP_CLIENT_ID ||
          !connectionConfig.GITHUB_APP_PRIVATE_PEM_PATH ||
          !connectionConfig.GITHUB_APP_INSTALLATION_ID)
      ) {
        throw new Error(
          `Missing environment variable(s) for plugin (GITHUB_APP_CLIENT_ID, GITHUB_APP_PRIVATE_PEM_PATH, GITHUB_APP_INSTALLATION_ID)`,
        );
      }
      if (
        connectionConfig &&
        connectionConfig.GITHUB_APP_PRIVATE_PEM_PATH &&
        !existsSync(connectionConfig.GITHUB_APP_PRIVATE_PEM_PATH)
      ) {
        throw new Error(
          `Pem file path is invalid ${connectionConfig.GITHUB_APP_PRIVATE_PEM_PATH}`,
        );
      }

      // Generate the JWT
      const now = Date.now();
      connectionConfig.JWT_TOKEN = this._getJWT(
        Math.floor(now / 1000), // Current time in seconds
        connectionConfig.GITHUB_APP_PRIVATE_PEM_PATH,
        connectionConfig.GITHUB_APP_CLIENT_ID,
      );
      this._setJWTLifecycleHandler(now, connectionConfig);

      connectionConfig.accessToken = await this._getAccessToken(
        connectionConfig.GITHUB_API,
        connectionConfig.GITHUB_APP_INSTALLATION_ID,
        connectionConfig.JWT_TOKEN,
      );
      connectionConfig.ACCESS_TOKEN = JSON.parse(
        connectionConfig.accessToken,
      ).token;

      this._setAccessTokenLifecycleHandler(connectionConfig);
    } catch (err) {
      this.logger.error(
        { err },
        `Error in ${this.pluginName}-${this.pluginCode} startup.`,
      );
      throw new Error(
        `Error in ${this.pluginName}-${this.pluginCode} startup. ${err}`,
      );
    }
  }

  _getJWT(
    nowInSeconds: number,
    privatePemPath: string,
    githubAppClientId: string,
  ): string {
    // Read the contents of the PEM file
    const privatePem = readFileSync(privatePemPath, 'utf8');
    const privateKey = createPrivateKey(privatePem);

    const payload = {
      iat: nowInSeconds - 60, // Issued at time (60 seconds in the past)
      exp: nowInSeconds + this.JWT_TTL / 1000, // Expiration time (10 minutes from now)
      iss: githubAppClientId, // GitHub App's client ID
    };

    // Generate the JWT
    return sign(payload, privateKey, { algorithm: 'RS256' });
  }

  _setJWTLifecycleHandler(now: number, connectionConfig) {
    try {
      if (connectionConfig.JWT_TOKEN) {
        let timeoutHandlerId;
        let timeoutHandler = async () => {};
        timeoutHandler = async () => {
          try {
            this.logger.debug(
              { plugin: this.pluginCode },
              'Refreshing github app JWT token',
            );
            clearTimeout(timeoutHandlerId);
            const timeoutHandlerNow = Date.now();
            connectionConfig.JWT_TOKEN = await this._getJWT(
              Math.floor(timeoutHandlerNow / 1000),
              connectionConfig.GITHUB_APP_PRIVATE_PEM_PATH,
              connectionConfig.GITHUB_APP_CLIENT_ID,
            );
            if (process.env.NODE_ENV != 'test') {
              timeoutHandlerId = setTimeout(
                timeoutHandler,
                this._getTimeDifferenceInMsToFutureDate(
                  timeoutHandlerNow + this.JWT_TTL,
                ) - 10000,
              );
              connectionConfig.jwtTimeoutHandlerId = timeoutHandlerId;
            }
          } catch (err) {
            this.logger.error(
              { plugin: this.pluginCode, err },
              `Error refreshing JWT`,
            );
            throw err;
          }
        };

        timeoutHandlerId = setTimeout(
          timeoutHandler,
          this._getTimeDifferenceInMsToFutureDate(now + this.JWT_TTL) - 10000,
        );
        connectionConfig.jwtTimeoutHandlerId = timeoutHandlerId;
      }
    } catch (err) {
      this.logger.error(
        { plugin: this.pluginCode, err },
        `Error setting JWT lifecycle handler.`,
      );
      throw err;
    }
  }

  async _getAccessToken(
    endpointHostname: string,
    githubAppInstallationId: string,
    jwtToken: string,
  ) {
    try {
      const request: PostFilterPreparedRequest = {
        url: `https://${endpointHostname}/app/installations/${githubAppInstallationId}/access_tokens`,
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          Authorization: `Bearer ${jwtToken}`,
          'user-agent': 'Snyk Broker Github App Plugin',
        },
        method: 'POST',
      };

      const oauthResponse = await makeRequestToDownstream(request);
      const accessToken = oauthResponse.body ?? '';
      return accessToken;
    } catch (err) {
      this.logger.error(
        { plugin: this.pluginCode, err },
        `Error getting access token`,
      );
      throw err;
    }
  }

  _setAccessTokenLifecycleHandler(connectionConfig) {
    if (connectionConfig.accessToken) {
      let timeoutHandlerId;
      let timeoutHandler = async () => {};
      timeoutHandler = async () => {
        try {
          this.logger.debug(
            { plugin: this.pluginCode },
            'Refreshing github app access token',
          );
          clearTimeout(timeoutHandlerId);
          connectionConfig.accessToken = await this._getAccessToken(
            connectionConfig.GITHUB_API,
            connectionConfig.GITHUB_APP_INSTALLATION_ID,
            connectionConfig.JWT_TOKEN,
          );
          connectionConfig.ACCESS_TOKEN = JSON.parse(
            connectionConfig.accessToken,
          ).token;
          this.logger.debug(
            { plugin: this.pluginCode },
            `Refreshed access token expires at ${
              JSON.parse(connectionConfig.accessToken).expires_at
            }`,
          );
          if (process.env.NODE_ENV != 'test') {
            timeoutHandlerId = setTimeout(
              timeoutHandler,
              this._getTimeDifferenceInMsToFutureDate(
                JSON.parse(connectionConfig.accessToken).expires_at,
              ) - 10000,
            );
            connectionConfig.accessTokenTimeoutHandlerId = timeoutHandlerId;
          }
        } catch (err) {
          this.logger.error(
            { plugin: this.pluginCode, err },
            `Error setting Access Token lifecycle handler.`,
          );
          throw err;
        }
      };
      timeoutHandlerId = setTimeout(
        timeoutHandler,
        this._getTimeDifferenceInMsToFutureDate(
          JSON.parse(connectionConfig.accessToken).expires_at,
        ) - 10000,
      );
      connectionConfig.accessTokenTimeoutHandlerId = timeoutHandlerId;
    }
  }
  _getTimeDifferenceInMsToFutureDate(targetDate) {
    const currentDate = new Date();
    const futureDate = new Date(targetDate);
    const timeDifference = futureDate.getTime() - currentDate.getTime();
    return timeDifference;
  }

  // Hook to run pre requests operations - Optional. Uncomment to enable
  // async preRequest(
  //   connectionConfiguration: Record<string, any>,
  //   postFilterPreparedRequest: PostFilterPreparedRequest,
  // ) {
  //   this.logger.debug(
  //     { plugin: this.pluginName, connection: connectionConfiguration },
  //     'Running prerequest plugin',
  //   );
  //   return postFilterPreparedRequest;
  // }
}
