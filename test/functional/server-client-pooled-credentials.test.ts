// noinspection DuplicatedCode

import * as path from 'path';
import * as version from '../../lib/version';
import axios from 'axios';
import { BrokerClient, createBrokerClient } from '../setup/broker-client';
import { BrokerServer, createBrokerServer } from '../setup/broker-server';
import { TestWebServer, createTestWebServer } from '../setup/test-web-server';

const fixtures = path.resolve(__dirname, '..', 'fixtures');
const serverAccept = path.join(fixtures, 'server', 'filters.json');
const clientAccept = path.join(fixtures, 'client', 'filters.json');

describe('proxy requests originating from behind the broker server with pooled credentials', () => {
  let tws: TestWebServer;
  let bs: BrokerServer;
  let bc: BrokerClient;
  let brokerToken, metadata: string;

  beforeAll(async () => {
    tws = await createTestWebServer();

    bs = await createBrokerServer({ filters: serverAccept });

    bc = await createBrokerClient({
      brokerServerUrl: `http://localhost:${bs.port}`,
      brokerToken: '12345',
      filters: clientAccept,
      passwordPool: ['password1', 'password2'],
    });

    await new Promise((resolve) => {
      bs.server.io.on('connection', (socket) => {
        socket.on('identify', (clientData) => {
          brokerToken = clientData.token;
          metadata = clientData.metadata;
          resolve(brokerToken);
        });
      });
    });
  });

  afterAll(async () => {
    await tws.server.close();
    setTimeout(async () => {
      await bc.client.close();
    }, 100);
    await new Promise<void>((resolve) => {
      bc.client.io.on('close', () => {
        resolve();
      });
    });

    setTimeout(async () => {
      await bs.server.close();
    }, 100);
    await new Promise<void>((resolve) => {
      bs.server.io.on('close', () => {
        resolve();
      });
    });
  });

  it('identification', async () => {
    const filters = require(clientAccept);

    expect(brokerToken).toEqual('12345');
    expect(metadata).toMatchObject({
      capabilities: ['post-streams'],
      clientId: expect.any(String),
      filters: filters,
      preflightChecks: expect.any(Array),
      version,
    });
  });

  it('successfully broker on endpoint that forwards requests with basic auth, using first credential', async () => {
    const url = `http://localhost:${bs.port}/broker/${brokerToken}/basic-auth`;

    const response = await axios.get(url, {
      timeout: 1000,
      validateStatus: () => true,
    });
    const auth = response.data.replace('Basic ', '');
    const encodedAuth = Buffer.from(auth, 'base64').toString('utf-8');
    const status = response.status;

    expect(status).toEqual(200);
    expect(encodedAuth).toEqual('user:pass');
  });

  it('successfully broker on endpoint that forwards requests with token auth in origin, using first credential', async () => {
    const url = `http://localhost:${bs.port}/broker/${brokerToken}/echo-headers/github-token-in-origin`;

    const response = await axios.post(
      url,
      {},
      {
        timeout: 1000,
        validateStatus: () => true,
      },
    );
    expect(response.status).toEqual(200);
    expect(response.data.authorization).toEqual('token githubToken1');
  });

  it('successfully broker on endpoint that forwards requests with token auth in origin, using first credential again', async () => {
    const url = `http://localhost:${bs.port}/broker/${brokerToken}/echo-headers/github`;

    const response = await axios.post(
      url,
      {},
      {
        timeout: 1000,
        validateStatus: () => true,
      },
    );
    expect(response.status).toEqual(200);
    expect(response.data.authorization).toEqual('token githubToken');
  });
});
