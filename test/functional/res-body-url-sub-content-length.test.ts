import path from 'path';
import { axiosClient } from '../setup/axios-client';
import {
  BrokerClient,
  closeBrokerClient,
  createBrokerClient,
} from '../setup/broker-client';
import {
  BrokerServer,
  closeBrokerServer,
  createBrokerServer,
  waitForBrokerClientConnections,
} from '../setup/broker-server';
import { TestWebServer, createTestWebServer } from '../setup/test-web-server';

const fixtures = path.resolve(__dirname, '..', 'fixtures');
const serverAccept = path.join(fixtures, 'server', 'filters.json');
const clientAccept = path.join(fixtures, 'client', 'filters.json');
const responseUrl = 'http://private-registry.internal:8000/artifactory';
const fixturePath = '/test-blob-param/json-url-substitution';

describe('broker server API', () => {
  describe('fixed Client with unchanged Broker Server', () => {
    describe('response body URL substitution', () => {
      let testWebServer: TestWebServer;
      let brokerServer: BrokerServer;
      let brokerClient: BrokerClient;
      let brokerToken: string;

      beforeAll(async () => {
        const brokerServerPort = 9999;
        process.env.BROKER_SERVER_URL = `http://localhost:${brokerServerPort}`;

        testWebServer = await createTestWebServer();
        brokerServer = await createBrokerServer({
          port: brokerServerPort,
          filters: serverAccept,
        });
        brokerClient = await createBrokerClient({
          brokerServerUrl: `http://localhost:${brokerServer.port}`,
          brokerToken: 'broker-token-12345',
          filters: clientAccept,
          resBodyUrlSub: responseUrl,
          type: 'client',
        });

        const connections = await waitForBrokerClientConnections(
          brokerServer,
          2,
        );
        const primaryIndex =
          connections.metadataArray[0]['role'] === 'primary' ? 0 : 1;
        brokerToken = connections.brokerTokens[primaryIndex];
      });

      afterAll(async () => {
        await testWebServer.server.close();
        await closeBrokerClient(brokerClient);
        await closeBrokerServer(brokerServer);
        delete process.env.BROKER_SERVER_URL;
      });

      it('returns complete transformed JSON with requester-visible chunked framing', async () => {
        const origin = await axiosClient.get(
          `http://localhost:${testWebServer.port}${fixturePath}`,
          { transformResponse: (body) => body },
        );
        const originalBody = origin.data as string;
        const replacementUrl =
          'http://internal-broker-server-next/broker/broker-token-12345';
        const expectedBody = originalBody.replaceAll(
          responseUrl,
          replacementUrl,
        );

        expect(origin.headers['content-length']).toBe(
          `${Buffer.byteLength(originalBody, 'utf8')}`,
        );
        expect(Buffer.byteLength(expectedBody, 'utf8')).not.toBe(
          Buffer.byteLength(originalBody, 'utf8'),
        );

        const relayed = await axiosClient.get(
          `http://localhost:${brokerServer.port}/broker/${brokerToken}${fixturePath}`,
          { transformResponse: (body) => body },
        );

        expect(relayed.status).toBe(200);
        expect(relayed.headers).not.toHaveProperty('content-length');
        expect(relayed.headers['transfer-encoding']).toBe('chunked');
        expect(relayed.headers['x-regression-header']).toBe('preserved');
        expect(relayed.data).toBe(expectedBody);
        expect(Buffer.byteLength(relayed.data, 'utf8')).toBe(
          Buffer.byteLength(expectedBody, 'utf8'),
        );
        expect(() => JSON.parse(relayed.data)).not.toThrow();
        expect(JSON.parse(relayed.data).versions).toHaveLength(20);
      });
    });
  });
});
