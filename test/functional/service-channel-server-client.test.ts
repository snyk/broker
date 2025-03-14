import path from 'path';
import version from '../../lib/hybrid-sdk/common/utils/version';
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

describe('proxy requests originating from behind the broker server', () => {
  let tws: TestWebServer;
  let bs: BrokerServer;
  let bc: BrokerClient;
  let brokerToken: string;
  let metadata: unknown;
  let brokerToken2: string;
  let metadata2: unknown;

  beforeAll(async () => {
    const PORT = 9999;
    process.env.BROKER_SERVER_URL = `http://localhost:${PORT}`;
    process.env.JIRAUSER = 'user';
    process.env.PASS = 'pass';
    process.env.LOG_ENABLE_BODY = 'true'; // setting this to true to assert it connects with it disabled

    tws = await createTestWebServer();

    bs = await createBrokerServer({ port: PORT, filters: serverAccept });

    bc = await createBrokerClient({
      brokerServerUrl: `${process.env.BROKER_SERVER_URL}`,
      brokerToken: 'broker-token-12345',
      filters: clientAccept,
      type: 'client',
    });
    const connData = await waitForBrokerClientConnections(bs, 2);
    const primaryIndex = connData.metadataArray[0]['role'] == 'primary' ? 0 : 1;
    const secondaryIndex =
      connData.metadataArray[1]['role'] == 'secondary' ? 1 : 0;
    brokerToken = connData.brokerTokens[primaryIndex];
    brokerToken2 = connData.brokerTokens[secondaryIndex];
    metadata = connData.metadataArray[primaryIndex];
    metadata2 = connData.metadataArray[secondaryIndex];
  });

  afterAll(async () => {
    await tws.server.close();
    await closeBrokerClient(bc);
    await closeBrokerServer(bs);
    delete process.env.BROKER_SERVER_URL;
  });

  it('server identifies self to client', async () => {
    expect(brokerToken).toEqual('broker-token-12345');
    expect(metadata).toStrictEqual({
      capabilities: ['post-streams'],
      filters: expect.any(Object),
      clientId: expect.any(String),
      version: version,
      role: 'primary',
      clientConfig: {
        bodyLogMode: false,
        brokerClientId: expect.any(String),
        credPooling: true, //client sets a PASSWORD_POOL
        customAccept: true,
        debugMode: false,
        haMode: false,
        insecureDownstream: false,
        privateCa: false,
        proxy: false,
        tlsReject: false,
        universalBroker: false,
        version: 'local',
      },
      identifier:
        '67f47824f806ee9c2fe6c7cc5849269fc1bc599c18e401ee2e2aea422bab6128',
    });
    expect(brokerToken2).toEqual('broker-token-12345');
    expect(metadata2).toStrictEqual({
      capabilities: ['post-streams'],
      filters: expect.any(Object),
      clientId: expect.any(String),
      version: version,
      role: 'secondary',
      clientConfig: {
        bodyLogMode: false,
        brokerClientId: expect.any(String),
        credPooling: true, //client sets a PASSWORD_POOL
        customAccept: true,
        debugMode: false,
        haMode: false,
        insecureDownstream: false,
        privateCa: false,
        proxy: false,
        tlsReject: false,
        universalBroker: false,
        version: 'local',
      },
      identifier:
        '67f47824f806ee9c2fe6c7cc5849269fc1bc599c18e401ee2e2aea422bab6128',
    });
  });

  it('invalid service command', async () => {
    const response = await axiosClient.get(
      `http://localhost:${bs.port}/service/${brokerToken}/notvalid`,
    );
    expect(response.status).toEqual(400);
    expect(response.data).toStrictEqual({
      ok: false,
      msg: 'Unknown service command.',
    });
  });

  it('no client for service command', async () => {
    const response = await axiosClient.get(
      `http://localhost:${bs.port}/service/wrongtoken/notvalid`,
    );
    expect(response.status).toEqual(404);
    expect(response.data).toStrictEqual({ ok: false });
  });

  it('no service command for classic broker', async () => {
    const response = await axiosClient.get(
      `http://localhost:${bs.port}/service/${brokerToken}/config/reload`,
    );
    expect(response.status).toEqual(501);
    expect(response.data).toStrictEqual({
      ok: false,
      msg: 'Service command not available in classic broker.',
    });
  });
});
