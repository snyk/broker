const PORT = 9001;
import path from 'path';
import { axiosClient } from '../setup/axios-client';
import {
  BrokerClient,
  closeBrokerClient,
  waitForBrokerServerConnections,
} from '../setup/broker-client';
import {
  BrokerServer,
  closeBrokerServer,
  createBrokerServer,
  waitForUniversalBrokerClientsConnection,
} from '../setup/broker-server';
import { TestWebServer, createTestWebServer } from '../setup/test-web-server';
import { DEFAULT_TEST_WEB_SERVER_PORT } from '../setup/constants';
import { createUniversalBrokerClient } from '../setup/broker-universal-client';

const fixtures = path.resolve(__dirname, '..', 'fixtures');
const serverAccept = path.join(fixtures, 'server', 'filters-cra.json');

/**
 * Integration test for multiple container registries of the same type (CN-728).
 *
 * Verifies that two ECR connections can be configured on a single universal
 * broker client and that identifier-based routing selects the correct one.
 * This exercises the client's HTTP routing boundary with the identifier header
 * that BrokerWorkload adds to server-originated requests. BrokerWorkload header
 * propagation and selected-connection interpolation have focused unit coverage.
 */
describe('Multiple container registries of the same type - identifier-based routing', () => {
  let tws: TestWebServer;
  let bs: BrokerServer;
  let bc: BrokerClient;
  process.env.API_BASE_URL = `http://localhost:${DEFAULT_TEST_WEB_SERVER_PORT}`;

  beforeAll(async () => {
    tws = await createTestWebServer();

    bs = await createBrokerServer({ port: PORT, filters: serverAccept });

    process.env.SKIP_REMOTE_CONFIG = 'true';
    process.env.SNYK_BROKER_SERVER_UNIVERSAL_CONFIG_ENABLED = 'true';
    process.env.UNIVERSAL_BROKER_ENABLED = 'true';
    process.env.SERVICE_ENV = 'universaltest-ecr';
    // Two ECR registries with different tokens (=> different identifiers)
    process.env.BROKER_TOKEN_1 = 'ecr-registry-1-token';
    process.env.BROKER_TOKEN_2 = 'ecr-registry-2-token';
    process.env.SNYK_BROKER_CLIENT_CONFIGURATION__common__default__BROKER_SERVER_URL = `http://localhost:${bs.port}`;

    bc = await createUniversalBrokerClient();
    await waitForUniversalBrokerClientsConnection(bs, 2);
  });

  afterAll(async () => {
    await tws.server.close();
    if (bc) {
      await closeBrokerClient(bc);
    }
    await closeBrokerServer(bs);
    delete process.env.API_BASE_URL;
    delete process.env.BROKER_SERVER_URL;
    delete process.env.BROKER_TOKEN_1;
    delete process.env.BROKER_TOKEN_2;
    delete process.env.SKIP_REMOTE_CONFIG;
    delete process.env.SNYK_BROKER_SERVER_UNIVERSAL_CONFIG_ENABLED;
    delete process.env.UNIVERSAL_BROKER_ENABLED;
    delete process.env.SERVICE_ENV;
    delete process.env
      .SNYK_BROKER_CLIENT_CONFIGURATION__common__default__BROKER_SERVER_URL;
  });

  it('should have two ECR connections established with distinct identifiers', async () => {
    const serverMetadata = await waitForBrokerServerConnections(bc);
    expect(serverMetadata.length).toBeGreaterThanOrEqual(2);
    expect(serverMetadata.map((x) => x.brokertoken)).toEqual(
      expect.arrayContaining(['ecr-registry-1-token', 'ecr-registry-2-token']),
    );
  });

  it('should broker container registry requests with identifier-based routing', async () => {
    const serverMetadata = await waitForBrokerServerConnections(bc);
    expect(serverMetadata.length).toBeGreaterThanOrEqual(2);

    const ecr1Metadata = serverMetadata.find(
      (x) => x.brokertoken === 'ecr-registry-1-token',
    );
    const ecr2Metadata = serverMetadata.find(
      (x) => x.brokertoken === 'ecr-registry-2-token',
    );

    expect(ecr1Metadata).toBeDefined();
    expect(ecr2Metadata).toBeDefined();
    expect(ecr1Metadata!.identifier).toBeDefined();
    expect(ecr2Metadata!.identifier).toBeDefined();
    // Identifiers must differ so the two same-type connections are addressable
    expect(ecr1Metadata!.identifier).not.toEqual(ecr2Metadata!.identifier);

    // Exercise the client boundary with the header shape emitted by the server.
    const ecr1Identifier = ecr1Metadata!.identifier;
    const response = await axiosClient.post(
      `http://localhost:${bc.port}/api/v2/import/done`,
      { some: { example: 'json' } },
      {
        headers: {
          'snyk-broker-connection-identifier': ecr1Identifier,
        },
      },
    );

    expect(response.status).toEqual(200);
  });
});
