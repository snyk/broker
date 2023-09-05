import path from 'path';
import version from '../../lib/common/utils/version';
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
  waitForBrokerClientConnection,
} from '../setup/broker-server';
import { TestWebServer, createTestWebServer } from '../setup/test-web-server';

const fixtures = path.resolve(__dirname, '..', 'fixtures');
const serverAccept = path.join(fixtures, 'server', 'filters.json');
const clientAccept = path.join(fixtures, 'client', 'filters.json');

describe('proxy requests originating from behind the broker server with pooled credentials', () => {
  let tws: TestWebServer;
  let bs: BrokerServer;
  let bc: BrokerClient;
  let brokerToken: string;
  let metadata: unknown;

  beforeAll(async () => {
    tws = await createTestWebServer();

    bs = await createBrokerServer({ filters: serverAccept });

    bc = await createBrokerClient({
      brokerServerUrl: `http://localhost:${bs.port}`,
      brokerToken: '12345',
      filters: clientAccept,
      passwordPool: ['password1', 'password2'],
    });
    ({ brokerToken, metadata } = await waitForBrokerClientConnection(bs));
  });

  afterAll(async () => {
    await tws.server.close();
    await closeBrokerClient(bc);
    await closeBrokerServer(bs);
  });

  it('identification', async () => {
    const filters = require(clientAccept);

    expect(brokerToken).toEqual('12345');
    expect(metadata).toMatchObject({
      capabilities: ['post-streams'],
      clientId: expect.any(String),
      filters: filters,
      version,
    });
  });

  it('successfully broker on endpoint that forwards requests with basic auth, using first credential', async () => {
    const url = `http://localhost:${bs.port}/broker/${brokerToken}/basic-auth`;

    const response = await axiosClient.get(url, {});
    const auth = response.data.replace('Basic ', '');
    const encodedAuth = Buffer.from(auth, 'base64').toString('utf-8');
    const status = response.status;

    expect(status).toEqual(200);
    expect(encodedAuth).toEqual('user:pass');
  });

  it('successfully broker on endpoint that forwards requests with token auth in origin, using first credential', async () => {
    const url = `http://localhost:${bs.port}/broker/${brokerToken}/echo-headers/github-token-in-origin`;

    const response = await axiosClient.post(url, {});
    expect(response.status).toEqual(200);
    expect(response.data.authorization).toEqual('token githubToken1');
  });

  it('successfully broker on endpoint that forwards requests with token auth in origin, using first credential again', async () => {
    const url = `http://localhost:${bs.port}/broker/${brokerToken}/echo-headers/github`;

    const response = await axiosClient.post(url, {});
    expect(response.status).toEqual(200);
    expect(response.data.authorization).toEqual('token githubToken');
  });
});
