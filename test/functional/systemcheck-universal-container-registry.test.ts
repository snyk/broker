import path from 'path';
import nock from 'nock';
import { axiosClient } from '../setup/axios-client';
import { BrokerClient, closeBrokerClient } from '../setup/broker-client';
import {
  BrokerServer,
  closeBrokerServer,
  createBrokerServer,
  waitForUniversalBrokerClientsConnection,
} from '../setup/broker-server';
import { createUniversalBrokerClient } from '../setup/broker-universal-client';

const fixtures = path.resolve(__dirname, '..', 'fixtures');
const serverAccept = path.join(fixtures, 'server', 'filters.json');
const clientAccept = path.join(fixtures, 'client', 'filters.json');

const registryCredentials = Buffer.from(
  JSON.stringify({
    type: 'nexus-cr',
    username: 'user',
    password: 'password',
  }),
).toString('base64');

const notValidatedMessage = (type: string) =>
  `No validations defined for connection type ${type}; not validated.`;

describe('broker client universal systemcheck endpoint', () => {
  let bs: BrokerServer;
  let bc: BrokerClient;

  // The client keeps its websocket connections in module state, so each
  // describe starts one client for its own set of connections and the tests
  // inside it only issue systemcheck requests.
  const startClient = async (
    serviceEnv: string,
    tokens: string[],
    extraEnv: Record<string, string> = {},
  ) => {
    bs = await createBrokerServer({ filters: serverAccept });
    process.env.SKIP_REMOTE_CONFIG = 'true';
    process.env.SNYK_BROKER_SERVER_UNIVERSAL_CONFIG_ENABLED = 'true';
    process.env.UNIVERSAL_BROKER_ENABLED = 'true';
    process.env.SERVICE_ENV = serviceEnv;
    process.env.CLIENT_ID = 'clientid';
    process.env.CLIENT_SECRET = 'clientsecret';
    process.env.CR_CREDENTIALS = registryCredentials;
    process.env.SNYK_BROKER_CLIENT_CONFIGURATION__common__default__BROKER_SERVER_URL = `http://localhost:${bs.port}`;
    tokens.forEach((token, i) => {
      process.env[`BROKER_TOKEN_${i + 1}`] = token;
    });
    Object.assign(process.env, extraEnv);
    bc = await createUniversalBrokerClient();
    await waitForUniversalBrokerClientsConnection(bs, tokens.length);
  };

  const stopClient = async () => {
    await closeBrokerClient(bc);
    await closeBrokerServer(bs);
    nock.cleanAll();
    for (const name of [
      'SKIP_REMOTE_CONFIG',
      'SNYK_BROKER_SERVER_UNIVERSAL_CONFIG_ENABLED',
      'UNIVERSAL_BROKER_ENABLED',
      'SERVICE_ENV',
      'CLIENT_ID',
      'CLIENT_SECRET',
      'CR_CREDENTIALS',
      'BROKER_TOKEN_1',
      'BROKER_TOKEN_2',
      'BROKER_TOKEN_3',
      'GITHUB_TOKEN',
      'GITLAB_TOKEN',
      'SNYK_FILTER_RULES_PATHS__github',
      'SNYK_FILTER_RULES_PATHS__gitlab',
      'SNYK_BROKER_CLIENT_CONFIGURATION__common__default__BROKER_SERVER_URL',
    ]) {
      delete process.env[name];
    }
  };

  const getSystemCheck = () =>
    axiosClient.get(`http://localhost:${bc.port}/systemcheck`, {
      timeout: 5_000,
    });

  describe('with only a container registry connection', () => {
    beforeAll(() => startClient('universaltest13', ['brokertoken1']));
    afterAll(stopClient);

    it('responds 200 and reports the connection as not validated', async () => {
      const response = await getSystemCheck();

      expect(response.status).toEqual(200);
      expect(response.data).toEqual([
        {
          connectionName: 'my nexus registry',
          validated: false,
          skipped: true,
          results: [],
          message: notValidatedMessage('nexus-cr'),
        },
      ]);
    });

    it('responds the same way on repeated calls', async () => {
      for (let i = 0; i < 2; i++) {
        const response = await getSystemCheck();
        expect(response.status).toEqual(200);
        expect(response.data).toHaveLength(1);
        expect(response.data[0].skipped).toEqual(true);
      }
    });
  });

  describe('with SCM and container registry connections', () => {
    beforeAll(() =>
      startClient(
        'universaltest14',
        ['brokertoken1', 'brokertoken2', 'brokertoken3'],
        {
          GITHUB_TOKEN: 'ghtoken',
          GITLAB_TOKEN: 'gltoken',
          SNYK_FILTER_RULES_PATHS__github: clientAccept,
          SNYK_FILTER_RULES_PATHS__gitlab: clientAccept,
        },
      ),
    );
    afterAll(stopClient);
    afterEach(() => nock.cleanAll());

    it('reports every connection in order when SCM validations pass', async () => {
      nock('https://snyk.io')
        .persist()
        .get('/no-such-url-ever')
        .reply(200, 'scm ok');

      const response = await getSystemCheck();

      expect(response.status).toEqual(200);
      expect(response.data).toMatchObject([
        {
          connectionName: 'my github connection',
          validated: true,
          results: [
            {
              url: 'https://snyk.io/no-such-url-ever',
              data: 'scm ok',
              statusCode: 200,
            },
          ],
        },
        {
          connectionName: 'my second nexus registry',
          validated: false,
          skipped: true,
          results: [],
          message: notValidatedMessage('nexus-cr'),
        },
        {
          connectionName: 'my gitlab connection',
          validated: true,
          results: [
            {
              url: 'https://snyk.io/no-such-url-ever',
              data: 'scm ok',
              statusCode: 200,
            },
          ],
        },
      ]);
    });

    it('responds 500 for a failing SCM validation without dropping the registry result', async () => {
      nock('https://snyk.io')
        .persist()
        .get('/no-such-url-ever')
        .reply(500, 'scm failing');

      const response = await getSystemCheck();

      expect(response.status).toEqual(500);
      expect(response.data).toMatchObject([
        {
          connectionName: 'my github connection',
          validated: false,
          message:
            'Validation failed, please review connection details for my github connection.',
          results: [{ statusCode: 500, data: 'scm failing' }],
        },
        {
          connectionName: 'my second nexus registry',
          validated: false,
          skipped: true,
          message: notValidatedMessage('nexus-cr'),
        },
        {
          connectionName: 'my gitlab connection',
          validated: false,
          message:
            'Validation failed, please review connection details for my gitlab connection.',
          results: [{ statusCode: 500, data: 'scm failing' }],
        },
      ]);
    });
  });
});
