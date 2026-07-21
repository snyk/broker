import bodyParser from 'body-parser';
import express from 'express';
import http from 'http';
import { choosePort } from './detect-port';
import { createTestLogger } from '../helpers/logger';
import { DEFAULT_TEST_API_SERVER_PORT } from './constants';
import { Express } from 'express';

const LOG = createTestLogger();

/**
 * Local mock server simulating the Snyk REST API (api.snyk.io)
 * for unit or functional tests. Handles endpoints that the broker
 * client calls against API_BASE_URL, such as the dispatcher service.
 */
export type TestApiServer = {
  port: number;
  server: http.Server;
};

export const createTestApiServer = async (
  port?: number,
): Promise<TestApiServer> => {
  const app = express();
  applyMiddlewares(app);
  applyApiRoutes(app);

  const resolvedPort = port
    ? await choosePort(port)
    : DEFAULT_TEST_API_SERVER_PORT;
  const server = http.createServer(app).listen(resolvedPort);

  LOG.debug(
    { port: resolvedPort },
    `TestApiServer is listening on port ${resolvedPort}...`,
  );

  server.addListener('close', () => {
    LOG.debug({ port: resolvedPort }, 'TestApiServer has been shut down');
  });

  return Promise.resolve({ port: resolvedPort, server });
};

const applyMiddlewares = (app: Express) => {
  app.use(
    bodyParser.raw({
      type: () => true,
      limit: '10mb',
    }),
  );
};

const applyApiRoutes = (app: Express) => {
  const apiRouter = express.Router();

  // Dispatcher: allocate a broker server for this client connection.
  // Classic broker uses /hidden/broker (singular), universal broker uses
  // /hidden/brokers (plural) via SNYK_DISPATCHER_URL_PREFIX.
  const dispatcherResponse = {
    data: { attributes: { server_id: 'test-server-1' } },
  };

  apiRouter.post(
    '/hidden/broker/:token/connections/:clientId',
    (_: express.Request, resp: express.Response) => {
      resp.status(200).json(dispatcherResponse);
    },
  );

  apiRouter.post(
    '/hidden/brokers/:token/connections/:clientId',
    (_: express.Request, resp: express.Response) => {
      resp.status(200).json(dispatcherResponse);
    },
  );

  // Webhook API fallback: when the websocket is down, the broker client posts
  // the webhook directly to API_BASE_URL (i.e. api.snyk.io in production).
  apiRouter.post(
    '/webhook/github/12345678-1234-1234-1234-000000000000',
    (_: express.Request, resp: express.Response) => {
      resp.status(200).send('Received webhook via API');
    },
  );

  apiRouter.post(
    '/webhook/github/return-req-headers',
    (req: express.Request, resp: express.Response) => {
      resp.status(200).send(req.headers);
    },
  );

  apiRouter.all('*', (_: express.Request, resp: express.Response) => {
    resp.status(400).send(false);
  });

  app.use('/', apiRouter);
};
