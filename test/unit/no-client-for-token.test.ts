import { overloadHttpRequestWithConnectionDetailsMiddleware } from '../../lib/hybrid-sdk/server/routesHandlers/httpRequestHandler';
import express from 'express';
import request from 'supertest';

jest.mock('../../lib/hybrid-sdk/server/socket', () => {
  const originalModule = jest.requireActual(
    '../../lib/hybrid-sdk/server/socket',
  );

  return {
    __esModule: true,
    ...originalModule,
    getSocketConnections: () => {
      return new Map();
    },
  };
});

jest.mock('node:os', () => {
  const originalModule = jest.requireActual('node:os');

  return {
    __esModule: true,
    ...originalModule,
    hostname: () => {
      return 'broker-snyk-server-v2-0-0';
    },
  };
});

describe('Testing older clients specific logic', () => {
  it('Testing the old client redirected to primary from secondary pods', async () => {
    const app = express();
    app.all(
      '/broker/:token/*',
      overloadHttpRequestWithConnectionDetailsMiddleware,
    );

    const response = await request(app).get(
      '/broker/7fe7a57b-aa0d-416a-97fc-472061737e25/path',
    );
    expect(response.status).toEqual(404);
  });
});
