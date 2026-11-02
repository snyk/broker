import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { axiosClient } from '../setup/axios-client';
import {
  BrokerClient,
  closeBrokerClient,
  createBrokerClient,
  waitForBrokerServerConnections,
} from '../setup/broker-client';
import { createUniversalBrokerClient } from '../setup/broker-universal-client';
import {
  BrokerServer,
  closeBrokerServer,
  createBrokerServer,
} from '../setup/broker-server';
import { TestWebServer, createTestWebServer } from '../setup/test-web-server';
import { choosePort } from '../setup/detect-port';

jest.mock('dotenv', () => ({ config: jest.fn() }));

describe('Container registry routing', () => {
  describe.each(['Classic', 'single-connection Universal'])(
    '%s Broker',
    (mode) => {
      const environment = { ...process.env };
      let brokerClient: BrokerClient;
      let brokerServer: BrokerServer;
      let downstream: TestWebServer;
      let temporaryDirectory: string;
      let receivedScan: any;
      const receivedCallbacks: {
        url: string;
        token: string | string[] | undefined;
      }[] = [];
      const identifier = 'compatibility-broker-token';

      beforeAll(async () => {
        process.env.UNIVERSAL_BROKER_ENABLED = '';
        process.env.UNIVERSAL_BROKER_GA = '';
        process.env.BROKER_SERVER_MANDATORY_AUTH_ENABLED = '';
        process.env.SERVICE_ENV = 'test';
        process.env.IPV6_CONNECTIVITY_CHECK_ENABLED = 'false';
        process.env.PREFLIGHT_CHECKS_ENABLED = 'false';
        downstream = await createTestWebServer({
          port: 17610,
          configure: (app) => {
            app.post('/scan', (req, res) => {
              receivedScan = JSON.parse(req.body.toString());
              res.sendStatus(202);
            });
            app.post(
              ['/api/v2/import/result', '/api/v2/import/done'],
              (req, res) => {
                receivedCallbacks.push({
                  url: req.url,
                  token: req.headers['x-broker-token'],
                });
                res.sendStatus(200);
              },
            );
          },
        });
        temporaryDirectory = await mkdtemp(
          path.join(tmpdir(), 'broker-compatibility-'),
        );
        const filters = path.join(temporaryDirectory, 'server.json');
        await writeFile(
          filters,
          JSON.stringify({
            public: [{ method: 'POST', path: '/scan' }],
            private: [
              {
                method: 'POST',
                path: '/api/v2/import/:operation',
                origin: `http://localhost:${downstream.port}`,
              },
            ],
          }),
        );
        brokerServer = await createBrokerServer({ port: 17611, filters });
        const clientPort = await choosePort(17612);
        process.env.BROKER_CLIENT_URL = `http://localhost:${clientPort}`;
        process.env.CR_AGENT_URL = `http://localhost:${downstream.port}`;
        process.env.BROKER_SERVER_URL = `http://localhost:${brokerServer.port}`;
        if (mode === 'Classic') {
          brokerClient = await createBrokerClient({
            port: clientPort,
            brokerServerUrl: process.env.BROKER_SERVER_URL,
            brokerToken: identifier,
            filters: path.resolve(
              __dirname,
              '../../client-templates/container-registry-agent/accept.json.sample',
            ),
          });
        } else {
          process.env.UNIVERSAL_BROKER_ENABLED = 'true';
          process.env.SERVICE_ENV = 'universaltest4';
          process.env.SKIP_REMOTE_CONFIG = 'true';
          process.env.BROKER_TOKEN_1 = identifier;
          process.env['SNYK_CONNECTIONS__my cra connection__CR_AGENT_URL'] =
            process.env.CR_AGENT_URL;
          brokerClient = await createUniversalBrokerClient({
            port: clientPort,
          });
        }
        await waitForBrokerServerConnections(brokerClient);
      });

      afterAll(async () => {
        if (brokerClient) await closeBrokerClient(brokerClient);
        if (brokerServer) await closeBrokerServer(brokerServer);
        if (downstream)
          await new Promise<void>((resolve, reject) =>
            downstream.server.close((error) =>
              error ? reject(error) : resolve(),
            ),
          );
        if (temporaryDirectory)
          await rm(temporaryDirectory, { recursive: true, force: true });
        process.env = environment;
      });

      it('delivers unscoped asynchronous callbacks through its connection', async () => {
        const response = await axiosClient.post(
          `http://localhost:${brokerServer.port}/broker/${identifier}/scan`,
          {
            callbacks: {
              resultUrl: '${BROKER_CLIENT_URL}/api/v2/import/result',
              doneUrl: '${BROKER_CLIENT_URL}/api/v2/import/done',
              token: 'callback-token',
            },
            BROKER_VAR_SUB: ['callbacks.resultUrl', 'callbacks.doneUrl'],
          },
        );
        expect(response.status).toBe(202);
        for (const operation of ['result', 'done']) {
          const callbackUrl = receivedScan.callbacks[`${operation}Url`];
          expect(callbackUrl).toBe(
            `http://localhost:${brokerClient.port}/api/v2/import/${operation}`,
          );
          const response = await axiosClient.post(callbackUrl, {
            callbackToken: 'callback-token',
          });
          expect(response.status).toBe(200);
        }
        expect(receivedCallbacks).toEqual([
          { url: '/api/v2/import/result', token: identifier },
          { url: '/api/v2/import/done', token: identifier },
        ]);
      });
    },
  );
});
