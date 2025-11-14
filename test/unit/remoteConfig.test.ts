import { unlinkSync, writeFileSync } from 'fs';
import { retrieveConnectionsForDeployment } from '../../lib/hybrid-sdk/client/config/remoteConfig';
import {
  getConfig,
  loadBrokerConfig,
} from '../../lib/hybrid-sdk/common/config/config';
import {
  ClientOpts,
  CONFIGURATION,
} from '../../lib/hybrid-sdk/common/types/options';
import { setAuthConfigKey } from '../../lib/hybrid-sdk/client/auth/oauth';
import nock from 'nock';

const universalFilePathLocationForTests = `${__dirname}/../../config.universal.json`;

describe('Remote config helpers', () => {
  beforeAll(() => {
    setAuthConfigKey('accessToken', { expireIn: 123, authHeader: 'dummy' });
    writeFileSync(universalFilePathLocationForTests, `{}`);
    nock('http://restapihostname')
      .persist()
      .get(
        `/hidden/brokers/deployments/67890/connections?version=2024-04-02~experimental`,
      )
      .reply(() => {
        return [
          200,
          {
            data: [
              {
                id: 'CONNECTION_ID_1',
                type: 'broker_connection',
                attributes: {
                  name: 'my github connection',
                  configuration: {
                    default: {},
                    required: {
                      github_token: 'GITHUB_TOKEN_XYZ',
                    },
                    type: 'github',
                  },
                  identifier: 'BROKER_TOKEN_1',
                  deployment_id: '67890',
                },
              },
            ],
          },
        ];
      })
      .get(
        `/hidden/brokers/deployments/67891/connections?version=2024-04-02~experimental`,
      )
      .reply(() => {
        return [
          200,
          {
            data: [
              {
                id: 'CONNECTION_ID_1',
                type: 'broker_connection',
                attributes: {
                  name: 'my github connection',
                  configuration: {
                    default: {},
                    required: {
                      github_token: 'GITHUB_TOKEN_XYZ',
                    },
                    type: 'github',
                  },
                  deployment_id: '67890',
                },
              },
            ],
          },
        ];
      })
      .get(
        `/hidden/brokers/deployments/67892/connections?version=2024-04-02~experimental`,
      )
      .reply(() => {
        return [
          500,
          {
            error: 'InternalServerError',
            error_description: 'An internal server error occurred',
          },
        ];
      })
      .get(
        `/hidden/brokers/deployments/67893/connections?version=2024-04-02~experimental`,
      )
      .reply(() => {
        return [503, 'Service Unavailable - Invalid JSON Response'];
      });
  });
  beforeEach(() => {});
  afterAll(() => {
    unlinkSync(universalFilePathLocationForTests);
  });
  afterEach(() => {
    delete process.env.SERVICE_ENV;
    delete process.env.CLIENT_ID;
    delete process.env.CLIENT_SECRET;
  });
  it('Retrieve connections from deployment ID', async () => {
    await loadBrokerConfig();
    let config = getConfig() as CONFIGURATION;

    const deploymentId = '67890';
    const apiVersion = '2024-04-02~experimental';
    const apiBaseUrl = 'http://restapihostname';
    config.deploymentId = deploymentId;
    config.apiVersion = apiVersion;
    config.API_BASE_URL = apiBaseUrl;
    config.supportedBrokerTypes = [];
    config.filterRulesPaths = {};
    config.brokerType = 'client';
    process.env.SERVICE_ENV = 'universal';
    process.env.CLIENT_ID = '123';
    process.env.CLIENT_SECRET = '123';

    const clientOps: ClientOpts = {
      port: 0,
      config,
      filters: { public: [], private: [] },
    };

    await retrieveConnectionsForDeployment(
      clientOps,
      universalFilePathLocationForTests,
    );
    await loadBrokerConfig();
    config = getConfig() as CONFIGURATION;
    expect(config.connections).toEqual({
      'my github connection': {
        GITHUB_TOKEN: 'GITHUB_TOKEN_XYZ',
        identifier: 'BROKER_TOKEN_1',
        friendlyName: 'my github connection',
        id: 'CONNECTION_ID_1',
        type: 'github',
        contexts: {},
      },
    });
  });

  it('Retrieve identifier less connection from install ID and deployment ID', async () => {
    await loadBrokerConfig();
    let config = getConfig() as CONFIGURATION;

    const deploymentId = '67891';
    const apiVersion = '2024-04-02~experimental';
    const apiBaseUrl = 'http://restapihostname';
    config.deploymentId = deploymentId;
    config.apiVersion = apiVersion;
    config.API_BASE_URL = apiBaseUrl;
    process.env.SERVICE_ENV = 'universal';
    process.env.CLIENT_ID = '123';
    process.env.CLIENT_SECRET = '123';

    const clientOps: ClientOpts = {
      port: 0,
      config,
      filters: { public: [], private: [] },
    };

    await retrieveConnectionsForDeployment(
      clientOps,
      universalFilePathLocationForTests,
    );
    await loadBrokerConfig();
    config = getConfig() as CONFIGURATION;

    expect(config.connections).toEqual({
      'my github connection': {
        GITHUB_TOKEN: 'GITHUB_TOKEN_XYZ',
        friendlyName: 'my github connection',
        id: 'CONNECTION_ID_1',
        type: 'github',
        contexts: {},
      },
    });
  });

  it('Should throw error with valid JSON body when non-404 error occurs', async () => {
    await loadBrokerConfig();
    const config = getConfig() as CONFIGURATION;

    config.deploymentId = '67892';
    config.apiVersion = '2024-04-02~experimental';
    config.API_BASE_URL = 'http://restapihostname';

    const clientOps: ClientOpts = {
      port: 0,
      config,
      filters: { public: [], private: [] },
    };

    await expect(
      retrieveConnectionsForDeployment(
        clientOps,
        universalFilePathLocationForTests,
      ),
    ).rejects.toThrow(
      '500-InternalServerError:An internal server error occurred',
    );
  });

  it('Should throw error with status code only when non-404 error occurs with invalid JSON body', async () => {
    await loadBrokerConfig();
    const config = getConfig() as CONFIGURATION;

    config.deploymentId = '67893';
    config.apiVersion = '2024-04-02~experimental';
    config.API_BASE_URL = 'http://restapihostname';

    const clientOps: ClientOpts = {
      port: 0,
      config,
      filters: { public: [], private: [] },
    };

    await expect(
      retrieveConnectionsForDeployment(
        clientOps,
        universalFilePathLocationForTests,
      ),
    ).rejects.toThrow('503');
  });
});
