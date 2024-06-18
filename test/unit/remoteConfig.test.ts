import { unlinkSync, writeFileSync } from 'fs';
import { retrieveConnectionsForDeployment } from '../../lib/client/config/remoteConfig';
import { getConfig, loadBrokerConfig } from '../../lib/common/config/config';
import { ClientOpts } from '../../lib/common/types/options';
const nock = require('nock');
const universalFilePathLocationForTests = `${__dirname}/../../config.universal.json`;

describe('Remote config helpers', () => {
  beforeAll(() => {
    writeFileSync(universalFilePathLocationForTests, `{}`);
    nock('http://restapihostname')
      .persist()
      .get(
        `/rest/tenants/12345/brokers/installs/12345/deployments/67890/connections?version=2024-04-02~experimental`,
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
                  type: 'github',
                  configuration: {
                    default: {},
                    required: {
                      github_token: 'GITHUB_TOKEN_XYZ',
                    },
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
        `/rest/tenants/12345/brokers/installs/12345/deployments/67891/connections?version=2024-04-02~experimental`,
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
                  type: 'github',
                  configuration: {
                    default: {},
                    required: {
                      github_token: 'GITHUB_TOKEN_XYZ',
                    },
                  },
                  deployment_id: '67890',
                },
              },
            ],
          },
        ];
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
  it('Retrieve connections from install ID and deployment ID', async () => {
    await loadBrokerConfig();
    let config = getConfig();

    const installId = '12345';
    const tenantId = '12345';
    const deploymentId = '67890';
    const apiVersion = '2024-04-02~experimental';
    const apiBaseUrl = 'http://restapihostname';
    config.tenantId = tenantId;
    config.installId = installId;
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
    config = getConfig();
    expect(config.connections).toEqual({
      'my github connection': {
        GITHUB_TOKEN: 'GITHUB_TOKEN_XYZ',
        identifier: 'BROKER_TOKEN_1',
        friendlyName: 'my github connection',
        id: 'CONNECTION_ID_1',
        type: 'github',
      },
    });
  });

  it('Retrieve identifier less connection from install ID and deployment ID', async () => {
    await loadBrokerConfig();
    let config = getConfig();

    const installId = '12345';
    const tenantId = '12345';
    const deploymentId = '67891';
    const apiVersion = '2024-04-02~experimental';
    const apiBaseUrl = 'http://restapihostname';
    config.tenantId = tenantId;
    config.installId = installId;
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
    config = getConfig();

    expect(config.connections).toEqual({
      'my github connection': {
        GITHUB_TOKEN: 'GITHUB_TOKEN_XYZ',
        friendlyName: 'my github connection',
        id: 'CONNECTION_ID_1',
        type: 'github',
      },
    });
  });
});
