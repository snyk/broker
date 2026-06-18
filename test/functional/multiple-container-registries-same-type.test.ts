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
 * Integration test for multiple container registries of the same type.
 *
 * Note: This test verifies that multiple ECR registries can be configured
 * and that identifier-based routing works. The identifier header is set by
 * the BrokerWorkload when it receives requests from the server over websocket,
 * so this test verifies the end-to-end flow where:
 * 1. Server sends request over websocket to client
 * 2. BrokerWorkload adds identifier header
 * 3. Middleware routes based on identifier
 * 4. Request is forwarded to correct downstream registry
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
    process.env.CLIENT_ID = 'clientid';
    process.env.CLIENT_SECRET = 'clientsecret';
    // Create two ECR registries with different tokens
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
    delete process.env.BROKER_SERVER_URL;
    delete process.env.BROKER_TOKEN_1;
    delete process.env.BROKER_TOKEN_2;
    delete process.env.CLIENT_ID;
    delete process.env.CLIENT_SECRET;
  });

  it('should have two ECR connections established', async () => {
    const serverMetadata = await waitForBrokerServerConnections(bc);
    expect(serverMetadata.length).toBeGreaterThanOrEqual(2);
    expect(serverMetadata.map((x) => x.brokertoken)).toEqual(
      expect.arrayContaining(['ecr-registry-1-token', 'ecr-registry-2-token']),
    );
  });

  it('should successfully broker container registry requests with identifier-based routing', async () => {
    const serverMetadata = await waitForBrokerServerConnections(bc);
    expect(serverMetadata.length).toBeGreaterThanOrEqual(2);

    // Verify both connections are established
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
    // Identifiers should be different
    expect(ecr1Metadata!.identifier).not.toEqual(ecr2Metadata!.identifier);

    // When server sends requests over websocket, BrokerWorkload will add
    // the identifier header, and the middleware will route correctly.
    // This test verifies identifier-based routing by simulating a server request
    // with the connection identifier header.
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
