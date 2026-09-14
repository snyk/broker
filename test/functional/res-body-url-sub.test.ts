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

// Matches the tarball URLs the fixture route serves, so every substitution
// makes the body longer than the Content-Length the downstream declared.
const RES_BODY_URL_SUB = 'http://private-registry.internal:8000/artifactory';
const FIXTURE = '/test-blob-param/json-url-substitution';

describe('RES_BODY_URL_SUB response rewriting', () => {
  let tws: TestWebServer;
  let bs: BrokerServer;
  let bc: BrokerClient;
  let brokerToken: string;

  beforeAll(async () => {
    const PORT = 9999;
    process.env.BROKER_SERVER_URL = `http://localhost:${PORT}`;

    tws = await createTestWebServer();
    bs = await createBrokerServer({ port: PORT, filters: serverAccept });
    bc = await createBrokerClient({
      brokerServerUrl: `http://localhost:${bs.port}`,
      brokerToken: 'broker-token-12345',
      filters: clientAccept,
      resBodyUrlSub: RES_BODY_URL_SUB,
      type: 'client',
    });

    const connData = await waitForBrokerClientConnections(bs, 2);
    const primaryIndex = connData.metadataArray[0]['role'] == 'primary' ? 0 : 1;
    brokerToken = connData.brokerTokens[primaryIndex];
  });

  afterAll(async () => {
    await tws.server.close();
    await closeBrokerClient(bc);
    await closeBrokerServer(bs);
    delete process.env.BROKER_SERVER_URL;
  });

  it('serves a fixture whose rewritten body outgrows its Content-Length', async () => {
    const origin = await axiosClient.get(
      `http://localhost:${tws.port}${FIXTURE}`,
      { transformResponse: (data) => data },
    );

    const body = origin.data as string;
    expect(origin.headers['content-length']).toEqual(
      `${Buffer.byteLength(body, 'utf8')}`,
    );
    expect(body.split(RES_BODY_URL_SUB).length - 1).toEqual(20);
  });

  // Currently fails before the body is ever relayed: the 4-byte little-endian
  // ioData length prefix is written into the same buffer the substitution
  // transform reads, so `Buffer.from(chunk).toString()` puts it through a UTF-8
  // round trip. Any prefix byte >= 0x80 becomes U+FFFD, the Broker Server reads
  // a bogus metadata length and the requester gets an empty 200.
  it.failing('relays the rewritten body intact', async () => {
    const relayed = await axiosClient.get(
      `http://localhost:${bs.port}/broker/${brokerToken}${FIXTURE}`,
      { transformResponse: (data) => data },
    );

    const body = (relayed.data ?? '') as string;
    expect(relayed.status).toEqual(200);
    expect(body).not.toEqual('');
    expect(body).not.toContain(RES_BODY_URL_SUB);
    expect(body).toContain('/broker/');
    expect(() => JSON.parse(body)).not.toThrow();
    expect(JSON.parse(body).versions).toHaveLength(20);
  });
});
