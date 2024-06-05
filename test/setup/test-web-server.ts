import bodyParser from 'body-parser';
import express from 'express';
import fs from 'fs';
import http from 'http';
import https from 'https';
import { choosePort } from './detect-port';
import { createTestLogger } from '../helpers/logger';
import { DEFAULT_TEST_WEB_SERVER_PORT } from './constants';
import { Express } from 'express';

const LOG = createTestLogger();

interface CreateTestWebServerOptions {
  port?: number;
  sslCertificatePath?: string;
  sslCertificateKeyPath?: string;
}

/**
 * Local private web server with predefined routes
 * for unit or functional tests. The purpose of this
 * server is to simulate 3rd party (SCM, etc) systems.
 */
export type TestWebServer = {
  port: number;
  server: http.Server | https.Server;
};

export const createTestWebServer = async (
  params?: CreateTestWebServerOptions,
): Promise<TestWebServer> => {
  const app = express();
  applyMiddlewares(app);
  applyEchoRoutes(app);

  const port = params?.port
    ? await choosePort(params?.port)
    : DEFAULT_TEST_WEB_SERVER_PORT;
  let isHttps = false;
  let server: http.Server | https.Server;
  if (params?.sslCertificatePath && params?.sslCertificateKeyPath) {
    isHttps = true;
    server = https
      .createServer(
        {
          key: fs.readFileSync(params.sslCertificateKeyPath),
          cert: fs.readFileSync(params.sslCertificatePath),
        },
        app,
      )
      .listen(port);
  } else {
    server = http.createServer(app).listen(port);
  }
  LOG.debug(
    { port, is_https: isHttps },
    `TestWebServer is listening on port ${port}...`,
  );

  // log close event
  server.addListener('close', () => {
    LOG.debug({ port, is_https: isHttps }, 'TestWebServer has been shut down');
  });

  return Promise.resolve({
    port,
    server,
  });
};

const applyMiddlewares = (app: Express) => {
  app.disable('x-powered-by');

  // handle empty body
  app.use(
    (req: express.Request, _: express.Response, next: express.NextFunction) => {
      const emptyBody = Symbol('Empty Body');
      req.body = req.body || emptyBody;
      if (req.body === emptyBody) {
        delete req.body;
      }
      next();
    },
  );

  app.use(
    bodyParser.raw({
      type: (req) =>
        req.headers['content-type'] !==
        'application/vnd.broker.stream+octet-stream',
      limit: '10mb',
    }),
  );
};

const applyEchoRoutes = (app: Express) => {
  const echoRouter = express.Router();

  echoRouter.post(
    '/webhook/github/12345678-1234-1234-1234-123456789abc',
    (_: express.Request, resp: express.Response) => {
      resp.status(200);
      resp.send('Received webhook via websocket');
    },
  );
  echoRouter.post(
    '/webhook/gitlab/12345678-1234-1234-1234-123456789abc',
    (_: express.Request, resp: express.Response) => {
      resp.status(200);
      resp.send('Received webhook via websocket');
    },
  );
  echoRouter.post(
    '/webhook/github/12345678-1234-1234-1234-000000000000',
    (_: express.Request, resp: express.Response) => {
      resp.status(200);
      resp.send('Received webhook via API');
    },
  );

  echoRouter.get('/test', (_: express.Request, resp: express.Response) => {
    resp.status(200);
    resp.send('All good');
  });

  echoRouter.get(
    '/test-blob/1',
    (req: express.Request, resp: express.Response) => {
      const buf = Buffer.alloc(500);
      for (let i = 0; i < 500; i++) {
        buf.writeUInt8(i & 0xff, i);
      }

      resp.setHeader('test-orig-url', req.originalUrl);
      resp.status(299);
      resp.send(buf);
    },
  );

  echoRouter.get(
    '/test-blob/2',
    (req: express.Request, resp: express.Response) => {
      resp.setHeader('test-orig-url', req.originalUrl);
      resp.status(500);
      resp.send('Test Error');
    },
  );

  echoRouter.get(
    '/test-blob-param/:param',
    (req: express.Request, resp: express.Response) => {
      const size = parseInt(req.params.param, 10);
      const buf = Buffer.alloc(size);
      for (let i = 0; i < size; i++) {
        buf.writeUInt8(i & 0xff, i);
      }

      resp.status(200);
      resp.send(buf);
    },
  );

  echoRouter.get(
    '/basic-auth',
    (req: express.Request, resp: express.Response) => {
      resp.send(req.headers.authorization);
    },
  );

  echoRouter.get(
    '/echo-param/:param',
    (req: express.Request, resp: express.Response) => {
      resp.send(req.params.param);
    },
  );
  echoRouter.get(
    '/echo-auth-header-with-basic-auth/:param',
    (req: express.Request, resp: express.Response) => {
      resp.send(req.headers.authorization);
    },
  );

  echoRouter.get(
    '/echo-auth-header-with-bearer-auth/:param',
    (req: express.Request, resp: express.Response) => {
      resp.send(req.headers.authorization);
    },
  );

  echoRouter.get(
    '/echo-auth-header-with-raw-auth/:param',
    (req: express.Request, resp: express.Response) => {
      resp.send(req.headers.authorization);
    },
  );

  echoRouter.get(
    '/echo-origin/:param',
    (req: express.Request, resp: express.Response) => {
      resp.send(req.headers.authorization);
    },
  );

  echoRouter.get(
    '/echo-param-protected/:param',
    (req: express.Request, resp: express.Response) => {
      resp.send(req.params.param);
    },
  );

  echoRouter.post(
    '/echo-body/:param?',
    (req: express.Request, resp: express.Response) => {
      const contentType = req.get('Content-Type');
      if (contentType) {
        resp.type(contentType);
      }
      resp.send(req.body);
    },
  );

  // mimics functionality of https://httpbin.org/headers
  echoRouter.get(
    '/echo-headers/httpbin',
    (req: express.Request, resp: express.Response) => {
      resp.json({ headers: req.headers });
    },
  );

  // mimics functionality of https://httpbin.org/headers
  echoRouter.get(
    '/echo/textresponse',
    (req: express.Request, resp: express.Response) => {
      resp.status(200);
      resp.send('OK');
    },
  );

  echoRouter.post(
    '/echo-headers/:param?',
    (req: express.Request, resp: express.Response) => {
      resp.send(req.headers);
    },
  );

  echoRouter.get(
    '/echo-query/:param?',
    (req: express.Request, resp: express.Response) => {
      resp.json(req.query);
    },
  );

  echoRouter.get(
    '/long/nested/*',
    (req: express.Request, resp: express.Response) => {
      resp.send(req.originalUrl);
    },
  );

  echoRouter.get(
    '/repos/owner/repo/contents/folder/package.json',
    (req: express.Request, resp: express.Response) => {
      resp.json({ headers: req.headers, query: req.query, url: req.url });
    },
  );

  echoRouter.get(
    '/huge-file',
    (req: express.Request, resp: express.Response) => {
      resp.json({ data: 'a '.repeat(10485761) });
    },
  );

  echoRouter.post(
    '/api/v2/import/done',
    (req: express.Request, resp: express.Response) => {
      resp.status(200).send('OK');
    },
  );

  echoRouter.all('*', (_: express.Request, resp: express.Response) => {
    resp.status(400).send(false);
  });

  app.use(['/snykgit', '/'], echoRouter);
};
