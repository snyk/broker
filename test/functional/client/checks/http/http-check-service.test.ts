import { CheckStore } from '../../../../../lib/client/checks/check-store';
import { HttpCheckService } from '../../../../../lib/client/checks/http/http-check-service';
import { MockServer } from 'jest-mock-server';
import { aCheck } from '../../../../helpers/test-factories';
import { createInMemoryCheckStore } from '../../../../helpers/in-memory-check-store';

describe('Broker client HTTP check service', () => {
  const server = new MockServer();

  let checkStore: CheckStore;
  let mockServerBaseUrl: string;

  beforeAll(() => server.start());
  afterAll(() => server.stop());
  beforeEach(() => {
    server.reset();
    const url = server.getURL().toString();
    mockServerBaseUrl = url.endsWith('/') ? url.slice(0, -1) : url;

    checkStore = createInMemoryCheckStore([]);
  });

  it('should return status passing for 2xx http status codes', async () => {
    server.get(`/broker-server/healthcheck`).mockImplementationOnce((ctx) => {
      ctx.status = 200;
      ctx.body = { status: 'ok' };
    });
    const check = aCheck({
      url: `${mockServerBaseUrl}/broker-server/healthcheck`,
    });
    await checkStore.add(check);
    const service = new HttpCheckService(checkStore);

    const result = await service.run(check.checkId);

    expect(result).toBeDefined();
    expect(result).toMatchObject({
      id: check.checkId,
      name: check.checkName,
      output: expect.any(String),
      status: 'passing',
    });
  });

  it('should return status warning for 429 http status code', async () => {
    server.get(`/broker-server/rate-limiting`).mockImplementationOnce((ctx) => {
      ctx.status = 429;
      ctx.body = { status: 'rate-limiting' };
    });
    const check = aCheck({
      url: `${mockServerBaseUrl}/broker-server/rate-limiting`,
    });
    await checkStore.add(check);
    const service = new HttpCheckService(checkStore);

    const result = await service.run(check.checkId);

    expect(result).toBeDefined();
    expect(result).toMatchObject({
      id: check.checkId,
      name: check.checkName,
      output: expect.any(String),
      status: 'warning',
    });
  });

  it('should return status error for 500 http status code', async () => {
    server.get(`/broker-server/server-error`).mockImplementationOnce((ctx) => {
      ctx.status = 500;
      ctx.body = { status: 'internal-server-error' };
    });
    const check = aCheck({
      url: `${mockServerBaseUrl}/broker-server/server-error`,
    });
    await checkStore.add(check);
    const service = new HttpCheckService(checkStore);

    const result = await service.run(check.checkId);

    expect(result).toBeDefined();
    expect(result).toMatchObject({
      id: check.checkId,
      name: check.checkName,
      output: expect.any(String),
      status: 'error',
    });
  });
});
