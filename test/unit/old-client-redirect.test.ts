import bodyParser from 'body-parser';
import { overloadHttpRequestWithConnectionDetailsMiddleware } from '../../lib/server/routesHandlers/httpRequestHandler';
import express from 'express';
import request from 'supertest';
import nock from 'nock';
import path from 'path';
import { readFileSync } from 'node:fs';
import { connectionStatusHandler } from '../../lib/server/routesHandlers/connectionStatusHandler';

const fixtures = path.resolve(__dirname, '..', 'fixtures');

jest.mock('../../lib/server/socket', () => {
  const originalModule = jest.requireActual('../../lib/server/socket');

  return {
    __esModule: true,
    ...originalModule,
    getSocketConnections: () => {
      const map = new Map();

      map.set('7fe7a57b-aa0d-416a-97fc-472061737e24', [
        { socket: {}, socketVersion: '1', metadata: { capabilities: {} } },
      ]);
      // map.set('7fe7a57b-aa0d-416a-97fc-472061737e26', [
      //   { metadata: {version: '123', filter: {}} },
      // ]);
      return map;
    },
  };
});

jest.mock('node:os', () => {
  const originalModule = jest.requireActual('node:os');

  return {
    __esModule: true,
    ...originalModule,
    hostname: () => {
      return 'my-server-name-10-1';
    },
  };
});

describe('Testing older clients specific logic', () => {
  it('Testing the old client redirected to primary from secondary pods', async () => {
    nock(`http://my-server-name.default.svc.cluster`)
      .persist()
      .get(
        '/broker/7fe7a57b-aa0d-416a-97fc-472061737e25/path?connection_role=primary',
      )
      .reply(() => {
        return [200, { test: 'value' }];
      });
    const app = express();
    app.use(
      bodyParser.raw({
        type: (req) =>
          req.headers['content-type'] !==
          'application/vnd.broker.stream+octet-stream',
        limit: '10mb',
      }),
    );
    app.all(
      '/broker/:token/*',
      overloadHttpRequestWithConnectionDetailsMiddleware,
    );

    const response = await request(app)
      .get('/broker/7fe7a57b-aa0d-416a-97fc-472061737e25/path')
      .set('Host', 'my-server-name-1.default.svc.cluster');

    expect(response.status).toEqual(200);
    expect(response.body).toEqual({ test: 'value' });
  });
  it('Testing the old client redirected to primary from secondary pods - POST request', async () => {
    nock(`http://my-server-name.default.svc.cluster`)
      .persist()
      .post(
        '/broker/7fe7a57b-aa0d-416a-97fc-472061737e25/path?connection_role=primary',
      )
      .reply((_uri, requestBody) => {
        return [200, requestBody];
      });
    const app = express();
    app.use(
      bodyParser.raw({
        type: (req) =>
          req.headers['content-type'] !==
          'application/vnd.broker.stream+octet-stream',
        limit: '10mb',
      }),
    );
    app.all(
      '/broker/:token/*',
      overloadHttpRequestWithConnectionDetailsMiddleware,
    );

    const response = await request(app)
      .post('/broker/7fe7a57b-aa0d-416a-97fc-472061737e25/path')
      .set('Host', 'my-server-name-1.default.svc.cluster')
      .send({ test: 'value2' });

    expect(response.status).toEqual(200);
    expect(response.body).toEqual({ test: 'value2' });
  });
  it('Testing the old client redirected to primary from secondary pods - get request', async () => {
    const fileJson = JSON.parse(
      readFileSync(`${fixtures}/accept/ghe.json`).toString(),
    );
    nock(`http://my-server-name.default.svc.cluster`)
      .persist()
      .get(
        '/broker/7fe7a57b-aa0d-416a-97fc-472061737e25/file?connection_role=primary',
      )
      .reply(() => {
        return [200, fileJson];
      });
    const app = express();
    app.use(
      bodyParser.raw({
        type: (req) =>
          req.headers['content-type'] !==
          'application/vnd.broker.stream+octet-stream',
        limit: '10mb',
      }),
    );
    app.all(
      '/broker/:token/*',
      overloadHttpRequestWithConnectionDetailsMiddleware,
    );

    const response = await request(app)
      .get('/broker/7fe7a57b-aa0d-416a-97fc-472061737e25/file')
      .set('Host', 'my-server-name-1.default.svc.cluster');

    expect(response.status).toEqual(200);
    expect(response.body).toEqual(fileJson);
  });

  it('Testing the connection-status old client redirected to primary from secondary pods', async () => {
    nock(`http://my-server-name.default.svc.cluster`)
      .persist()
      .get(
        '/connection-status/7fe7a57b-aa0d-416a-97fc-472061737e26?connection_role=primary',
      )
      .reply(() => {
        return [200, { test: 'value' }];
      });
    const app = express();
    app.use(
      bodyParser.raw({
        type: (req) =>
          req.headers['content-type'] !==
          'application/vnd.broker.stream+octet-stream',
        limit: '10mb',
      }),
    );
    app.all('/connection-status/:token', connectionStatusHandler);

    const response = await request(app)
      .get('/connection-status/7fe7a57b-aa0d-416a-97fc-472061737e26')
      .set('Host', 'my-server-name-1.default.svc.cluster');

    expect(response.status).toEqual(200);
    expect(response.body).toEqual({ test: 'value' });
  });
});
