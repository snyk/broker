import { existsSync, readFileSync } from 'node:fs';
import BrokerPlugin from '../abstractBrokerPlugin';
import { createPrivateKey } from 'node:crypto';
import { sign } from 'jsonwebtoken';
import { makeRequestToDownstream } from '../../../http/request';
import { maskSCMToken } from '../../../common/utils/token';
import { replace } from '../../../common/utils/replace-vars';
import { PostFilterPreparedRequest } from '../../../../broker-workload/prepareRequest';
import { PluginConnectionConfig } from '../../../common/config/pluginsConfig';

export class Plugin extends BrokerPlugin {
  // Plugin Code and Name must be unique across all plugins.
  pluginCode = 'GITHUB_SERVER_APP_PLUGIN';
  pluginName = 'Github Server App Authentication Plugin';
  description = `
    Plugin to retrieve and manage credentials for Brokered Github Server App installs
    `;
  version = '0.1';
  applicableBrokerTypes = ['github-server-app', 'github-cloud-app']; // Must match broker types
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
  async startUp(
    connectionKey: string,
    connectionConfig,
    pluginConfig: PluginConnectionConfig,
  ): Promise<void> {
    try {
      const connectionName = connectionConfig.friendlyName;
      this.logger.info(
        { plugin: this.pluginName, connectionName },
        'Running Startup.',
      );

      this.logger.trace(
        {
          plugin: this.pluginCode,
          config: connectionConfig,
          pluginConfig: pluginConfig,
        },
        'Connection Config passed to the plugin',
      );
      if (
        connectionConfig &&
        (!connectionConfig.GITHUB_APP_CLIENT_ID ||
          !connectionConfig.GITHUB_APP_PRIVATE_PEM_PATH ||
          !connectionConfig.GITHUB_APP_INSTALLATION_ID ||
          !connectionConfig.GITHUB_APP_ID)
      ) {
        throw new Error(
          `Missing environment variable(s) for plugin (GITHUB_APP_CLIENT_ID, GITHUB_APP_PRIVATE_PEM_PATH, GITHUB_APP_INSTALLATION_ID).`,
        );
      }
      if (
        connectionConfig &&
        connectionConfig.GITHUB_APP_PRIVATE_PEM_PATH &&
        !existsSync(connectionConfig.GITHUB_APP_PRIVATE_PEM_PATH)
      ) {
        throw new Error(
          `PEM file path is invalid ${connectionConfig.GITHUB_APP_PRIVATE_PEM_PATH}.`,
        );
      }

      // Generate the JWT
      const now = Date.now();
      this.setPluginConfigParamForConnection(
        connectionName,
        'JWT_TOKEN',
        this._getJWT(
          Math.floor(now / 1000), // Current time in seconds
          connectionConfig.GITHUB_APP_PRIVATE_PEM_PATH,
          connectionConfig.GITHUB_APP_ID,
        ),
      );
      if (
        !this.getPluginConfigParamForConnection(connectionName, 'JWT_TOKEN')
      ) {
        throw new Error(`Github app plugin error: could not get JWT.`);
      }
      this._setJWTLifecycleHandler(connectionName, now, connectionConfig);

      const jwtToken = this.getPluginConfigParamForConnection(
        connectionKey,
        'JWT_TOKEN',
      );
      if (!jwtToken) {
        throw new Error(`Github app plugin error: could not get JWT.`);
      }
      this.setPluginConfigParamForConnection(
        connectionName,
        'ghaAccessToken',
        await this._getAccessToken(
          connectionConfig.GITHUB_API,
          connectionConfig.GITHUB_APP_INSTALLATION_ID,
          jwtToken,
        ),
      );
      const ghaAccessToken = this.getPluginConfigParamForConnection(
        connectionKey,
        'ghaAccessToken',
      );
      if (!ghaAccessToken) {
        throw new Error(`Github app plugin error: could not get access token.`);
      }

      this.setPluginConfigParamForConnection(
        connectionName,
        'GHA_ACCESS_TOKEN',
        JSON.parse(ghaAccessToken).token,
      );
      if (
        this.getPluginConfigParamForConnection(
          connectionName,
          'GHA_ACCESS_TOKEN',
        )
      ) {
        this._setAccessTokenLifecycleHandler(connectionName, connectionConfig);
      } else {
        throw new Error(
          `Github app plugin Error: could not extract access token.`,
        );
      }
    } catch (err) {
      this.logger.error(
        { err },
        `Error in ${this.pluginName}-${this.pluginCode} startup.`,
      );
      throw new Error(
        `Error in ${this.pluginName}-${this.pluginCode} startup. ${err}.`,
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
    try {
      this.logger.info(
        { plugin: this.pluginName, connectionKey },
        'Running Startup.',
      );

      this.logger.trace(
        {
          plugin: this.pluginCode,
          config: connectionConfiguration,
          pluginConfig: pluginConfig,
        },
        'Connection Config passed to the plugin',
      );
      if (
        connectionConfiguration &&
        (!connectionConfiguration.GITHUB_APP_CLIENT_ID ||
          !connectionConfiguration.GITHUB_APP_PRIVATE_PEM_PATH ||
          !connectionConfiguration.GITHUB_APP_INSTALLATION_ID ||
          !connectionConfiguration.GITHUB_APP_ID)
      ) {
        throw new Error(
          `Missing environment variable(s) for plugin (GITHUB_APP_CLIENT_ID, GITHUB_APP_PRIVATE_PEM_PATH, GITHUB_APP_INSTALLATION_ID).`,
        );
      }
      if (
        connectionConfiguration &&
        connectionConfiguration.GITHUB_APP_PRIVATE_PEM_PATH &&
        !existsSync(connectionConfiguration.GITHUB_APP_PRIVATE_PEM_PATH)
      ) {
        throw new Error(
          `PEM file path is invalid ${connectionConfiguration.GITHUB_APP_PRIVATE_PEM_PATH}.`,
        );
      }

      // Generate the JWT
      const now = Date.now();
      this.setPluginConfigParamForConnectionContext(
        connectionKey,
        contextId,
        'JWT_TOKEN',
        this._getJWT(
          Math.floor(now / 1000), // Current time in seconds
          connectionConfiguration.GITHUB_APP_PRIVATE_PEM_PATH,
          connectionConfiguration.GITHUB_APP_ID,
        ),
      );
      if (
        !this.getPluginConfigParamForConnectionContext(
          connectionKey,
          contextId,
          'JWT_TOKEN',
        )
      ) {
        throw new Error(`Github app plugin error: could not get JWT.`);
      }
      this._setContextJWTLifecycleHandler(
        connectionKey,
        contextId,
        now,
        connectionConfiguration,
      );

      this.setPluginConfigParamForConnectionContext(
        connectionKey,
        contextId,
        'ghaAccessToken',
        await this._getAccessToken(
          connectionConfiguration.GITHUB_API,
          connectionConfiguration.GITHUB_APP_INSTALLATION_ID,
          this.getPluginConfigParamForConnectionContext(
            connectionKey,
            contextId,
            'JWT_TOKEN',
          ),
        ),
      );
      if (
        !this.getPluginConfigParamForConnectionContext(
          connectionKey,
          contextId,
          'ghaAccessToken',
        )
      ) {
        throw new Error(`Github app plugin error: could not get access token.`);
      }

      this.setPluginConfigParamForConnectionContext(
        connectionKey,
        contextId,
        'GHA_ACCESS_TOKEN',
        JSON.parse(
          this.getPluginConfigParamForConnectionContext(
            connectionKey,
            contextId,
            'ghaAccessToken',
          ),
        ).token,
      );
      if (
        this.getPluginConfigParamForConnectionContext(
          connectionKey,
          contextId,
          'GHA_ACCESS_TOKEN',
        )
      ) {
        this._setContextAccessTokenLifecycleHandler(
          connectionKey,
          contextId,
          connectionConfiguration,
        );
      } else {
        throw new Error(
          `Github app plugin Error: could not extract access token.`,
        );
      }
    } catch (err) {
      this.logger.error(
        { err },
        `Error in ${this.pluginName}-${this.pluginCode} startup.`,
      );
      throw new Error(
        `Error in ${this.pluginName}-${this.pluginCode} startup. ${err}.`,
      );
    }
  }

  _getJWT(
    nowInSeconds: number,
    privatePemPath: string,
    githubAppId: string,
  ): string {
    // Read the contents of the PEM file
    const privatePem = readFileSync(privatePemPath, 'utf8');
    const privateKey = createPrivateKey(privatePem);

    const payload = {
      iat: nowInSeconds - 60, // Issued at time (60 seconds in the past)
      exp: nowInSeconds + this.JWT_TTL / 1000, // Expiration time (10 minutes from now)
      iss: githubAppId, // GitHub App's ID
    };
    // Generate the JWT
    return sign(payload, privateKey, { algorithm: 'RS256' });
  }

  _setJWTLifecycleHandler(
    connectionName: string,
    now: number,
    connectionConfig,
  ) {
    try {
      if (this.getPluginConfigParamForConnection(connectionName, 'JWT_TOKEN')) {
        let timeoutHandlerId;
        let timeoutHandler = async () => {};
        timeoutHandler = async () => {
          try {
            this.logger.debug(
              { plugin: this.pluginCode },
              'Refreshing github app JWT token.',
            );
            clearTimeout(timeoutHandlerId);
            const timeoutHandlerNow = Date.now();
            this.setPluginConfigParamForConnection(
              connectionName,
              'JWT_TOKEN',
              await this._getJWT(
                Math.floor(timeoutHandlerNow / 1000),
                connectionConfig.GITHUB_APP_PRIVATE_PEM_PATH,
                connectionConfig.GITHUB_APP_ID,
              ),
            );
            if (
              !this.getPluginConfigParamForConnection(
                connectionName,
                'JWT_TOKEN',
              )
            ) {
              throw new Error(
                `Github app plugin error: could not refresh JWT.`,
              );
            }

            timeoutHandlerId = setTimeout(
              timeoutHandler,
              this._getTimeDifferenceInMsToFutureDate(
                timeoutHandlerNow + this.JWT_TTL,
              ) - 10000,
            );
            this.setPluginConfigParamForConnection(
              connectionName,
              'jwtTimeoutHandlerId',
              timeoutHandlerId,
            );
          } catch (err) {
            this.logger.error(
              { plugin: this.pluginCode, err },
              `Error refreshing JWT.`,
            );
            throw err;
          }
        };

        timeoutHandlerId = setTimeout(
          timeoutHandler,
          this._getTimeDifferenceInMsToFutureDate(now + this.JWT_TTL) - 10000,
        );
        this.setPluginConfigParamForConnection(
          connectionName,
          'jwtTimeoutHandlerId',
          timeoutHandlerId,
        );
      }
    } catch (err) {
      this.logger.error(
        { plugin: this.pluginCode, err },
        `Error setting JWT lifecycle handler.`,
      );
      throw err;
    }
  }
  _setContextJWTLifecycleHandler(
    connectionName: string,
    contextId: string,
    now: number,
    connectionConfig,
  ) {
    try {
      if (
        this.getPluginConfigParamForConnectionContext(
          connectionName,
          contextId,
          'JWT_TOKEN',
        )
      ) {
        let timeoutHandlerId;
        let timeoutHandler = async () => {};
        timeoutHandler = async () => {
          try {
            this.logger.debug(
              { plugin: this.pluginCode },
              'Refreshing github app JWT token.',
            );
            clearTimeout(timeoutHandlerId);
            const timeoutHandlerNow = Date.now();
            this.setPluginConfigParamForConnectionContext(
              connectionName,
              contextId,
              'JWT_TOKEN',
              await this._getJWT(
                Math.floor(timeoutHandlerNow / 1000),
                connectionConfig.GITHUB_APP_PRIVATE_PEM_PATH,
                connectionConfig.GITHUB_APP_ID,
              ),
            );
            if (
              !this.getPluginConfigParamForConnectionContext(
                connectionName,
                contextId,
                'JWT_TOKEN',
              )
            ) {
              throw new Error(
                `Github app plugin error: could not refresh JWT.`,
              );
            }
            timeoutHandlerId = setTimeout(
              timeoutHandler,
              this._getTimeDifferenceInMsToFutureDate(
                timeoutHandlerNow + this.JWT_TTL,
              ) - 10000,
            );
            this.setPluginConfigParamForConnectionContext(
              connectionName,
              contextId,
              'jwtTimeoutHandlerId',
              timeoutHandlerId,
            );
          } catch (err) {
            this.logger.error(
              { plugin: this.pluginCode, err },
              `Error refreshing JWT.`,
            );
            throw err;
          }
        };

        timeoutHandlerId = setTimeout(
          timeoutHandler,
          this._getTimeDifferenceInMsToFutureDate(now + this.JWT_TTL) - 10000,
        );
        this.setPluginConfigParamForConnectionContext(
          connectionName,
          contextId,
          'jwtTimeoutHandlerId',
          timeoutHandlerId,
        );
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
        },
        method: 'POST',
      };

      const oauthResponse = await makeRequestToDownstream(request);
      if (oauthResponse.statusCode && oauthResponse.statusCode > 299) {
        throw new Error(
          `Unexpected error code ${oauthResponse.statusCode}: ${oauthResponse.body}`,
        );
      }
      const accessToken = oauthResponse.body ?? '';
      return accessToken;
    } catch (err) {
      this.logger.error(
        { plugin: this.pluginCode, err },
        `Error getting access token.`,
      );
      throw err;
    }
  }

  _setAccessTokenLifecycleHandler(connectionName, connectionConfig) {
    if (
      this.getPluginConfigParamForConnection(connectionName, 'ghaAccessToken')
    ) {
      let timeoutHandlerId;
      let timeoutHandler = async () => {};
      timeoutHandler = async () => {
        try {
          this.logger.debug(
            { plugin: this.pluginCode },
            'Refreshing github app access token.',
          );
          clearTimeout(timeoutHandlerId);
          const jwt = this.getPluginConfigParamForConnection(
            connectionName,
            'JWT_TOKEN',
          );
          if (!jwt) {
            throw new Error(`Github app plugin error: could not refresh JWT.`);
          }
          const accessToken = await this._getAccessToken(
            connectionConfig.GITHUB_API,
            connectionConfig.GITHUB_APP_INSTALLATION_ID,
            jwt,
          );
          this.setPluginConfigParamForConnection(
            connectionName,
            'ghaAccessToken',
            accessToken,
          );
          this.setPluginConfigParamForConnection(
            connectionName,
            'GHA_ACCESS_TOKEN',
            JSON.parse(accessToken).token,
          );

          this.logger.debug(
            {
              accessToken: maskSCMToken(JSON.parse(accessToken).token),
            },
            `Access token renewed!`,
          );

          this.logger.debug(
            { plugin: this.pluginCode },
            `Refreshed access token expires at ${
              JSON.parse(accessToken).expires_at
            }.`,
          );

          timeoutHandlerId = setTimeout(
            timeoutHandler,
            this._getTimeDifferenceInMsToFutureDate(
              JSON.parse(accessToken).expires_at,
            ) - 10000,
          );
          this.setPluginConfigParamForConnection(
            connectionName,
            'ghaAccessTokenTimeoutHandlerId',
            timeoutHandlerId,
          );
        } catch (err) {
          this.logger.error(
            { plugin: this.pluginCode, err },
            `Error setting access token lifecycle handler.`,
          );
          throw err;
        }
      };
      const ghaAccessTokenInHandler = this.getPluginConfigParamForConnection(
        connectionName,
        'ghaAccessToken',
      );
      if (!ghaAccessTokenInHandler) {
        throw new Error(`Github app plugin error: could not get access token.`);
      }
      timeoutHandlerId = setTimeout(
        timeoutHandler,
        this._getTimeDifferenceInMsToFutureDate(
          JSON.parse(ghaAccessTokenInHandler).expires_at,
        ) - 10000,
      );
      this.setPluginConfigParamForConnection(
        connectionName,
        'ghaAccessTokenTimeoutHandlerId',
        timeoutHandlerId,
      );
    }
  }
  _setContextAccessTokenLifecycleHandler(
    connectionName: string,
    contextId: string,
    connectionConfig,
  ) {
    if (
      this.getPluginConfigParamForConnectionContext(
        connectionName,
        contextId,
        'ghaAccessToken',
      )
    ) {
      let timeoutHandlerId;
      let timeoutHandler = async () => {};
      timeoutHandler = async () => {
        try {
          this.logger.debug(
            { plugin: this.pluginCode },
            'Refreshing github app access token.',
          );
          clearTimeout(timeoutHandlerId);
          const jwt = this.getPluginConfigParamForConnectionContext(
            connectionName,
            contextId,
            'JWT_TOKEN',
          );
          if (!jwt) {
            throw new Error(`Github app plugin error: could not refresh JWT.`);
          }
          const accessToken = await this._getAccessToken(
            connectionConfig.GITHUB_API,
            connectionConfig.GITHUB_APP_INSTALLATION_ID,
            jwt,
          );
          this.setPluginConfigParamForConnectionContext(
            connectionName,
            contextId,
            'ghaAccessToken',

            accessToken,
          );
          this.setPluginConfigParamForConnectionContext(
            connectionName,
            contextId,
            'GHA_ACCESS_TOKEN',
            JSON.parse(accessToken).token,
          );

          this.logger.debug(
            {
              accessToken: maskSCMToken(JSON.parse(accessToken).token),
            },
            `Access token renewed!`,
          );

          this.logger.debug(
            { plugin: this.pluginCode },
            `Refreshed access token expires at ${
              JSON.parse(accessToken).expires_at
            }.`,
          );
          timeoutHandlerId = setTimeout(
            timeoutHandler,
            this._getTimeDifferenceInMsToFutureDate(
              JSON.parse(accessToken).expires_at,
            ) - 10000,
          );
          this.setPluginConfigParamForConnectionContext(
            connectionName,
            contextId,
            'ghaAccessTokenTimeoutHandlerId',
            timeoutHandlerId,
          );
        } catch (err) {
          this.logger.error(
            { plugin: this.pluginCode, err },
            `Error setting access token lifecycle handler.`,
          );
          throw err;
        }
      };
      const ghaAccessTokenInHandler =
        this.getPluginConfigParamForConnectionContext(
          connectionName,
          contextId,
          'ghaAccessToken',
        );
      if (!ghaAccessTokenInHandler) {
        throw new Error(`Github app plugin error: could not get access token.`);
      }
      timeoutHandlerId = setTimeout(
        timeoutHandler,
        this._getTimeDifferenceInMsToFutureDate(
          JSON.parse(ghaAccessTokenInHandler).expires_at,
        ) - 10000,
      );
      this.setPluginConfigParamForConnectionContext(
        connectionName,
        contextId,
        'ghaAccessTokenTimeoutHandlerId',
        timeoutHandlerId,
      );
    }
  }
  _getTimeDifferenceInMsToFutureDate(targetDate) {
    const currentDate = new Date();
    const futureDate = new Date(targetDate);
    const timeDifference = futureDate.getTime() - currentDate.getTime();
    return timeDifference;
  }

  // Hook to run pre requests operations - Optional. Uncomment to enable
  async preRequest(
    connectionConfiguration: Record<string, any>,
    postFilterPreparedRequest: PostFilterPreparedRequest,
  ) {
    this.logger.debug(
      { plugin: this.pluginName, connection: connectionConfiguration },
      'Running prerequest plugin.',
    );

    const regexPattern = /\$[A-Za-z0-9_%]+/g;
    const matches = postFilterPreparedRequest.url.match(regexPattern);
    if (matches) {
      for (const pathPart of matches) {
        const source = replace(
          `${pathPart.replace('$', '${')}}`,
          connectionConfiguration,
        ); // replace the variables
        postFilterPreparedRequest.url = postFilterPreparedRequest.url.replace(
          pathPart,
          source,
        );
      }
    }

    return postFilterPreparedRequest;
  }
}
