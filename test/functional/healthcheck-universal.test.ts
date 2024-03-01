import path from 'path';
import { axiosClient } from '../setup/axios-client';
import { BrokerClient, closeBrokerClient } from '../setup/broker-client';
import {
  BrokerServer,
  closeBrokerServer,
  createBrokerServer,
  waitForUniversalBrokerClientsConnection,
} from '../setup/broker-server';
import { TestWebServer, createTestWebServer } from '../setup/test-web-server';
import { createUniversalBrokerClient } from '../setup/broker-universal-client';

const fixtures = path.resolve(__dirname, '..', 'fixtures');
const serverAccept = path.join(fixtures, 'server', 'filters.json');

describe('proxy requests originating from behind the broker client', () => {
  let tws: TestWebServer;
  let bs: BrokerServer;
  let bc: BrokerClient;

  beforeAll(async () => {
    delete process.env.BROKER_SERVER_URL;
    tws = await createTestWebServer();
    bs = await createBrokerServer({ filters: serverAccept });
    process.env.SNYK_BROKER_CLIENT_CONFIGURATION__common__default__BROKER_SERVER_URL = `http://localhost:${bs.port}`;
  });

  afterAll(async () => {
    await tws.server.close();
    await closeBrokerServer(bs);
    delete process.env.BROKER_SERVER_URL;
    delete process.env
      .SNYK_BROKER_CLIENT_CONFIGURATION__common__default__BROKER_SERVER_URL;
  });

  afterEach(async () => {
    await closeBrokerClient(bc);
  });

  it('universal client healthcheck', async () => {
    process.env.UNIVERSAL_BROKER_ENABLED = 'true';
    process.env.SERVICE_ENV = 'universaltest';
    process.env.BROKER_TOKEN_1 = 'brokertoken1';
    process.env.BROKER_TOKEN_2 = 'brokertoken2';
    process.env.BROKER_TOKEN_3 = 'brokertoken3';
    process.env.GITHUB_TOKEN = 'ghtoken';
    process.env.GITLAB_TOKEN = 'gltoken';
    process.env.AZURE_REPOS_TOKEN = '123';
    process.env.AZURE_REPOS_HOST = 'hostname';
    process.env.AZURE_REPOS_ORG = 'org';
    bc = await createUniversalBrokerClient();
    await waitForUniversalBrokerClientsConnection(bs, 2);
    const response = await axiosClient.get(
      `http://localhost:${bc.port}/healthcheck`,
    );

    expect(response.status).toEqual(200);
    expect(response.data).toHaveLength(3);
    expect(response.data[0]).toEqual(
      expect.objectContaining({
        brokerServerUrl: `http://localhost:${bs.port}/`,
        friendlyName: 'my github connection',
        identifier: 'brok-...-ken1',
        ok: true,
        version: 'local',
        websocketConnectionOpen: true,
      }),
    );
    expect(response.data[1]).toEqual(
      expect.objectContaining({
        brokerServerUrl: `http://localhost:${bs.port}/`,
        friendlyName: 'my gitlab connection',
        identifier: 'brok-...-ken2',
        ok: true,
        version: 'local',
        websocketConnectionOpen: true,
      }),
    );
    expect(response.data[2]).toEqual(
      expect.objectContaining({
        brokerServerUrl: `http://localhost:${bs.port}/`,
        friendlyName: 'my azure connection',
        identifier: 'brok-...-ken3',
        ok: true,
        version: 'local',
        websocketConnectionOpen: true,
      }),
    );
    delete process.env.UNIVERSAL_BROKER_ENABLED;
    delete process.env.SERVICE_ENV;
    delete process.env.BROKER_TOKEN_1;
    delete process.env.BROKER_TOKEN_2;
    delete process.env.BROKER_TOKEN_3;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITLAB_TOKEN;
    delete process.env.AZURE_REPOS_TOKEN;
    delete process.env.AZURE_REPOS_HOST;
    delete process.env.AZURE_REPOS_ORG;
    delete process.env
      .SNYK_BROKER_CLIENT_CONFIGURATION__common__default__BROKER_SERVER_URL;
  });
});
