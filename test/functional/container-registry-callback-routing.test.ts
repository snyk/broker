import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { Request } from 'express';
import { axiosClient } from '../setup/axios-client';
import {
  BrokerClient,
  closeBrokerClient,
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
  describe('two Docker Hub connections', () => {
    const environment = { ...process.env };
    const scans: Record<string, { body: any; headers: Request['headers'] }[]> =
      { a: [], b: [] };
    const callbacks: { url: string; body: any; headers: Request['headers'] }[] =
      [];
    const callbackQuery =
      '?job=one%20two&space=one+two&x=~&flag&empty=&x=%2f&x=%2F&bad=%FF';
    const downstreamServers: TestWebServer[] = [];
    let brokerClient: BrokerClient;
    let brokerServer: BrokerServer;
    let temporaryDirectory: string;

    beforeAll(async () => {
      process.env.UNIVERSAL_BROKER_ENABLED = '';
      process.env.SERVICE_ENV = 'test';
      process.env.PREFLIGHT_CHECKS_ENABLED = 'false';
      process.env.IPV6_CONNECTIVITY_CHECK_ENABLED = 'false';
      process.env.UNIVERSAL_BROKER_GA = '';
      process.env.BROKER_SERVER_MANDATORY_AUTH_ENABLED = '';
      process.env.NODE_EXTRA_CA_CERTS = '';
      const destination = await createTestWebServer({
        port: await choosePort(17510),
        configure: (app) => {
          app.post(
            ['/api/v2/import/result', '/api/v2/import/done'],
            (req, res) => {
              callbacks.push({
                url: req.url,
                body: JSON.parse(req.body.toString()),
                headers: req.headers,
              });
              res.sendStatus(200);
            },
          );
        },
      });
      downstreamServers.push(destination);
      temporaryDirectory = await mkdtemp(
        path.join(tmpdir(), 'broker-callbacks-'),
      );
      const filters = path.join(temporaryDirectory, 'server-filters.json');
      await writeFile(
        filters,
        JSON.stringify({
          public: [{ method: 'POST', path: '/scan' }],
          private: [
            {
              method: 'POST',
              path: '/api/v2/import/:operation',
              origin: `http://localhost:${destination.port}`,
            },
          ],
        }),
      );
      brokerServer = await createBrokerServer({
        filters,
        port: await choosePort(17511),
      });
      for (const name of ['a', 'b']) {
        process.env[`TEST_CR_CREDENTIALS_${name.toUpperCase()}`] = Buffer.from(
          JSON.stringify({
            type: 'docker-hub',
            username: `user-${name}`,
            password: `password-${name}`,
          }),
        ).toString('base64');
        const agent = await createTestWebServer({
          port: await choosePort(name === 'a' ? 17512 : 17513),
          configure: (app) => {
            app.post('/scan', (req, res) => {
              scans[name].push({
                body: JSON.parse(req.body.toString()),
                headers: req.headers,
              });
              res.sendStatus(202);
            });
          },
        });
        downstreamServers.push(agent);
        process.env[
          `TEST_CRA_URL_${name.toUpperCase()}`
        ] = `http://localhost:${agent.port}`;
      }
      const clientPort = await choosePort(17514);
      process.env.TEST_CALLBACK_URL = `http://localhost:${clientPort}`;
      process.env.BROKER_TOKEN_1 = 'callback-test-connection-a';
      process.env.BROKER_TOKEN_2 = 'callback-test-connection-b';
      process.env.SKIP_REMOTE_CONFIG = 'true';
      process.env.SNYK_BROKER_SERVER_UNIVERSAL_CONFIG_ENABLED = 'true';
      process.env.UNIVERSAL_BROKER_ENABLED = 'true';
      process.env.SERVICE_ENV = 'universaltest-callbacks';
      process.env.API_BASE_URL = `http://localhost:${brokerServer.port}`;
      process.env.SNYK_BROKER_CLIENT_CONFIGURATION__common__default__BROKER_SERVER_URL = `http://localhost:${brokerServer.port}`;
      brokerClient = await createUniversalBrokerClient({ port: clientPort });
      await waitForBrokerServerConnections(brokerClient);
    });

    afterAll(async () => {
      if (brokerClient) await closeBrokerClient(brokerClient);
      if (brokerServer) await closeBrokerServer(brokerServer);
      for (const downstream of downstreamServers) {
        await new Promise<void>((resolve, reject) =>
          downstream.server.close((error) =>
            error ? reject(error) : resolve(),
          ),
        );
      }
      if (temporaryDirectory)
        await rm(temporaryDirectory, { recursive: true, force: true });
      process.env = environment;
    });

    it.each([
      {
        name: 'a',
        identifier: 'callback-test-connection-a',
      },
      {
        name: 'b',
        identifier: 'callback-test-connection-b',
      },
    ])(
      'delivers $name credentials and callbacks',
      async ({ name, identifier }) => {
        const otherName = name === 'a' ? 'b' : 'a';
        const otherScanCount = scans[otherName].length;
        const response = await axiosClient.post(
          `http://localhost:${brokerServer.port}/broker/${identifier}/scan`,
          {
            target: { name: 'example/image:latest' },
            callbacks: {
              resultUrl:
                '${BROKER_CLIENT_URL}/api/v2/import/result' + callbackQuery,
              doneUrl:
                '${BROKER_CLIENT_URL}/api/v2/import/done' + callbackQuery,
              token: `callback-for-${name}`,
            },
            BROKER_VAR_SUB: ['callbacks.resultUrl', 'callbacks.doneUrl'],
          },
          {
            headers: {
              'x-broker-var-sub': 'x-snyk-source-credentials',
              'x-snyk-source-credentials': '${CR_CREDENTIALS}',
            },
          },
        );
        expect(response.status).toBe(202);
        expect(scans[otherName]).toHaveLength(otherScanCount);
        const scan = scans[name][scans[name].length - 1];
        const credentials = JSON.parse(
          Buffer.from(
            scan.headers['x-snyk-source-credentials'] as string,
            'base64',
          ).toString(),
        );
        expect(credentials).toMatchObject({
          username: `user-${name}`,
          password: `password-${name}`,
          type: 'docker-hub',
        });
        expect(JSON.stringify(scan)).not.toContain(identifier);
        expect(scan.headers).not.toHaveProperty(
          'snyk-broker-connection-identifier',
        );
        expect(scan.headers).not.toHaveProperty('x-broker-token');
        expect(scan.body).not.toHaveProperty('BROKER_VAR_SUB');

        for (const operation of ['result', 'done']) {
          const callbackUrl = scan.body.callbacks[`${operation}Url`];
          const callbackBody =
            operation === 'result'
              ? {
                  callbackToken: scan.body.callbacks.token,
                  scanResults: [],
                  resultId: 1,
                  subTaskId: 'container',
                }
              : {
                  callbackToken: scan.body.callbacks.token,
                  resultCount: 1,
                  state: 'complete',
                  subTaskId: 'container',
                };
          const callbackResponse = await axiosClient.post(
            callbackUrl,
            callbackBody,
          );
          expect(callbackResponse.status).toBe(200);
          const received = callbacks[callbacks.length - 1];
          expect(received.body).toEqual(callbackBody);
          expect(received.url).toBe(
            `/api/v2/import/${operation}${callbackQuery}`,
          );
          expect(received.headers['x-broker-token']).toBe(identifier);
          expect(received.headers).not.toHaveProperty(
            'snyk-broker-connection-identifier',
          );
          expect(received.url).not.toContain('snyk-broker-connection');
        }
      },
    );

    it('rejects unknown hosted connection identity before contacting either agent', async () => {
      const counts = [scans.a.length, scans.b.length];
      const response = await axiosClient.post(
        `http://localhost:${brokerServer.port}/broker/unknown/scan`,
        {},
        { validateStatus: () => true },
      );
      expect(response.status).toBe(404);
      expect([scans.a.length, scans.b.length]).toEqual(counts);
    });

    it('rejects missing and invalid callback identity without contacting Registry', async () => {
      const count = callbacks.length;
      for (const query of [
        '',
        '?snyk-broker-connection=invalid',
        `?snyk-broker-connection=${'0'.repeat(64)}`,
      ]) {
        const response = await axiosClient.post(
          `http://localhost:${brokerClient.port}/api/v2/import/result${query}`,
          {},
          { validateStatus: () => true },
        );
        expect(response.status).toBeGreaterThanOrEqual(400);
      }
      expect(callbacks).toHaveLength(count);
    });
  });
});
