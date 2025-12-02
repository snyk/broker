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

import * as dispatcher from '../../lib/hybrid-sdk/server/infra/dispatcher';
import * as identifyHandler from '../../lib/hybrid-sdk/server/socketHandlers/identifyHandler';
import { delay } from '../helpers/utils';

const fixtures = path.resolve(__dirname, '..', 'fixtures');
const serverAccept = path.join(fixtures, 'server', 'filters.json');
const clientAccept = path.join(fixtures, 'client', 'filters.json');

describe('client send termination signal to broker server', () => {
  let tws: TestWebServer;
  let bs: BrokerServer;
  let bc: BrokerClient;
  const spyClientDisconnected = jest.spyOn(dispatcher, 'clientDisconnected');

  const spyAddClientIdToTerminationMap = jest.spyOn(
    identifyHandler,
    'addClientIdToTerminationMap',
  );
  const spyProcessExit = jest
    .spyOn(process, 'exit')
    // Disabling es-lint, complains of unused "code" otherwise
    // eslint-disable-next-line
    .mockImplementation((code?: number) => undefined as never);
  beforeAll(async () => {
    const PORT = 9999;
    tws = await createTestWebServer();
    process.env.RESPONSE_DATA_HIDDEN_ENABLED = 'true';
    bs = await createBrokerServer({ filters: serverAccept, port: PORT });

    process.env.SNYK_BROKER_SERVER_UNIVERSAL_CONFIG_ENABLED = 'true';
    process.env.API_BASE_URL = `http://localhost:${bs.port}`;
    process.env.UNIVERSAL_BROKER_ENABLED = 'true';
    process.env.SERVICE_ENV = 'universaltest';
    process.env.BROKER_TOKEN_1 = 'brokertoken1';
    process.env.BROKER_TOKEN_2 = 'brokertoken2';
    process.env.BROKER_TOKEN_3 = 'brokertoken3';
    process.env.BROKER_TOKEN_4 = 'brokertoken4';
    process.env.GITHUB_TOKEN = 'ghtoken';
    process.env.GITLAB_TOKEN = 'gltoken';
    process.env.AZURE_REPOS_TOKEN = '123';
    process.env.AZURE_REPOS_HOST = 'hostname';
    process.env.AZURE_REPOS_ORG = 'org';
    process.env.JIRA_PAT = 'jirapat';
    process.env.RAW_AUTH = 'CustomScheme CustomToken';
    process.env.JIRA_HOSTNAME = 'hostname';
    process.env.SNYK_BROKER_CLIENT_CONFIGURATION__common__default__BROKER_SERVER_URL = `http://localhost:${bs.port}`;
    process.env.SNYK_FILTER_RULES_PATHS__github = clientAccept;
    process.env.SNYK_FILTER_RULES_PATHS__gitlab = clientAccept;
    process.env['SNYK_FILTER_RULES_PATHS__azure-repos'] = clientAccept;
    process.env['SNYK_FILTER_RULES_PATHS__jira-bearer-auth'] = clientAccept;
    process.env.CLIENT_ID = 'clienid';
    process.env.CLIENT_SECRET = 'clientsecret';
    process.env.SKIP_REMOTE_CONFIG = 'true';
    process.env.ACCEPT_APPRISK = 'false';

    bc = await createUniversalBrokerClient();
    await waitForUniversalBrokerClientsConnection(bs, 2);
  });

  afterEach(async () => {
    spyClientDisconnected.mockReset();
    spyAddClientIdToTerminationMap.mockReset();
    spyProcessExit.mockReset();
  });
  afterAll(async () => {
    spyClientDisconnected.mockReset();
    spyAddClientIdToTerminationMap.mockReset();
    spyProcessExit.mockReset();
    await tws.server.close();
    await closeBrokerClient(bc);
    await closeBrokerServer(bs);
    delete process.env.BROKER_SERVER_URL;
    delete process.env.SNYK_BROKER_SERVER_UNIVERSAL_CONFIG_ENABLED;
    delete process.env
      .SNYK_BROKER_CLIENT_CONFIGURATION__common__default__BROKER_SERVER_URL;
    delete process.env.CLIENT_ID;
    delete process.env.CLIENT_SECRET;
    delete process.env.SKIP_REMOTE_CONFIG;
  });

  it('successfully send termination signal across tunnel and notify dispatcher of disconnection', async () => {
    const response = await axiosClient.get(
      `http://localhost:${bs.port}/broker/${process.env.BROKER_TOKEN_1}/echo-param/xyz`,
    );

    expect(response.status).toEqual(200);
    expect(response.data).toEqual('xyz');
    process.emit('SIGINT');
    await delay(1000);
    expect(spyAddClientIdToTerminationMap).toHaveBeenCalledWith(
      process.env.BROKER_TOKEN_1,
      expect.any(String),
    );
    expect(spyClientDisconnected).toHaveBeenCalledWith(
      process.env.BROKER_TOKEN_1,
      expect.any(String),
    );
    await delay(13000); // LET THE GRACE PERIOD PASS
    expect(process.exit).toHaveBeenCalled();
  });
});
