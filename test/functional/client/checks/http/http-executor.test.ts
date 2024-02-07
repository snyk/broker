import http from 'http';
import { MockServer } from 'jest-mock-server';
import { aHttpCheck } from '../../../../helpers/test-factories';
import { executeHttpRequest } from '../../../../../lib/client/checks/http/http-executor';
import { setTimeout } from 'node:timers/promises';

describe('client/checks/http/http-executor.ts', () => {
  const server = new MockServer();

  let mockServerBaseUrl: string;

  beforeAll(async () => await server.start());
  afterAll(async () => await server.stop());
  beforeEach(() => {
    server.reset();
    const url = server.getURL().toString();
    mockServerBaseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
  });

  describe('executeHttpRequest()', () => {
    it('should return status passing for 2xx http status codes', async () => {
      server.get(`/broker-server/healthcheck`).mockImplementationOnce((ctx) => {
        ctx.status = 200;
        ctx.body = { status: 'ok' };
      });
      const check = aHttpCheck({
        url: `${mockServerBaseUrl}/broker-server/healthcheck`,
      });

      const result = await executeHttpRequest(
        { id: check.id, name: check.name },
        { url: check.url, method: check.method, timeoutMs: check.timeoutMs },
      );

      expect(result).toBeDefined();
      expect(result).toMatchObject({
        id: check.id,
        name: check.id,
        output: expect.any(String),
        status: 'passing',
      });
    });

    it('should return status warning for 429 http status code', async () => {
      server
        .get(`/broker-server/rate-limiting`)
        .mockImplementationOnce((ctx) => {
          ctx.status = 429;
          ctx.body = { status: 'rate-limiting' };
        });
      const check = aHttpCheck({
        url: `${mockServerBaseUrl}/broker-server/rate-limiting`,
      });

      const result = await executeHttpRequest(
        { id: check.id, name: check.name },
        { url: check.url, method: check.method, timeoutMs: check.timeoutMs },
      );

      expect(result).toBeDefined();
      expect(result).toMatchObject({
        id: check.id,
        name: check.name,
        output: expect.any(String),
        status: 'warning',
      });
    });

    it('should return status error for 500 http status code', async () => {
      server
        .get(`/broker-server/server-error`)
        .mockImplementationOnce((ctx) => {
          ctx.status = 500;
          ctx.body = { status: 'internal-server-error' };
        });
      const check = aHttpCheck({
        url: `${mockServerBaseUrl}/broker-server/rate-limiting`,
      });

      const result = await executeHttpRequest(
        { id: check.id, name: check.name },
        { url: check.url, method: check.method, timeoutMs: check.timeoutMs },
      );

      expect(result).toBeDefined();
      expect(result).toMatchObject({
        id: check.id,
        name: check.name,
        output: expect.any(String),
        status: 'error',
      });
    });

    it('should add common http headers to request', async () => {
      const spyOnRequestFn = jest.spyOn(http, 'request');
      server.get(`/broker-server/healthcheck`).mockImplementationOnce((ctx) => {
        ctx.status = 200;
        ctx.body = { status: 'ok' };
      });
      const check = aHttpCheck({
        url: `${mockServerBaseUrl}/broker-server/healthcheck`,
      });

      await executeHttpRequest(
        { id: check.id, name: check.name },
        { url: check.url, method: check.method, timeoutMs: check.timeoutMs },
      );

      expect(spyOnRequestFn.mock.lastCall[1].headers).toMatchObject({
        Accept: expect.any(String),
        'Content-Type': expect.any(String),
      });
    });

    it.skip('should throw an error after 3 retries', async () => {
      const responseWithTimeout = async (ctx) => {
        await setTimeout(100, 'waiting 100ms');
        ctx.response = 200;
        ctx.body = { status: 'ok' };
      };
      server
        .get('/broker-server/timeout')
        .mockImplementationOnce(responseWithTimeout)
        .mockImplementationOnce(responseWithTimeout)
        .mockImplementationOnce(responseWithTimeout)
        .mockImplementationOnce(responseWithTimeout);

      const check = aHttpCheck({
        url: `${mockServerBaseUrl}/broker-server/timeout`,
        timeoutMs: 10,
      });

      await expect(
        executeHttpRequest(
          { id: check.id, name: check.name },
          { url: check.url, method: check.method, timeoutMs: check.timeoutMs },
        ),
      ).rejects.toThrowError();
    });
  });
});
