jest.mock(
  '../../../../../lib/hybrid-sdk/client/retry/exponential-backoff',
  () => ({
    retry: async <T>(fn: () => Promise<T> | T) => fn(),
  }),
);

// Replace the downstream HTTP call with a jest.fn we can drive per test.
jest.mock('../../../../../lib/hybrid-sdk/http/request', () => ({
  makeSingleRawRequestToDownstream: jest.fn(),
}));

import { executeHttpRequest } from '../../../../../lib/hybrid-sdk/client/checks/http/http-executor';
import { makeSingleRawRequestToDownstream } from '../../../../../lib/hybrid-sdk/http/request';

const mockedRequest = makeSingleRawRequestToDownstream as jest.MockedFunction<
  typeof makeSingleRawRequestToDownstream
>;

const httpOptions = {
  url: 'http://example.test/healthcheck',
  method: 'GET' as const,
  timeoutMs: 5000,
};

describe('executeHttpRequest — error-handling regression', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('preserves the original Error instance, message, and stack on rethrow', async () => {
    const original = new Error('ECONNREFUSED 127.0.0.1:443');
    // Capture the original stack so we can confirm it survives the rethrow.
    const originalStack = original.stack;
    (original as any).code = 'ECONNREFUSED';

    mockedRequest.mockRejectedValueOnce(original);

    let caught: unknown;
    try {
      await executeHttpRequest(
        { id: 'broker-server-status', name: 'Broker Server Healthcheck' },
        httpOptions,
      );
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeDefined();
    expect(caught).toBeInstanceOf(Error);

    expect((caught as Error).message).toContain('broker-server-status');
    expect((caught as Error).message).toContain('ECONNREFUSED 127.0.0.1:443');

    expect((caught as Error).stack).toBe(
      originalStack?.replace(original.message, (caught as Error).message) ??
        expect.any(String),
    );

    expect(caught).toBe(original);
    expect((caught as any).code).toBe('ECONNREFUSED');
  });

  it('wraps a non-Error string throwable in an Error, preserving the original via cause', async () => {
    mockedRequest.mockRejectedValueOnce('not an Error instance');

    let caught: unknown;
    try {
      await executeHttpRequest(
        { id: 'broker-server-status', name: 'Broker Server Healthcheck' },
        httpOptions,
      );
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain('broker-server-status');
    expect((caught as Error).message).toContain('not an Error instance');
    expect((caught as Error).cause).toBe('not an Error instance');
  });

  it('wraps a non-Error object throwable, preserving it via cause', async () => {
    const original = { code: 'X', detail: { reason: 'bad' } };
    mockedRequest.mockRejectedValueOnce(original);

    let caught: unknown;
    try {
      await executeHttpRequest(
        { id: 'broker-server-status', name: 'Broker Server Healthcheck' },
        httpOptions,
      );
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain('broker-server-status');
    expect((caught as Error).cause).toBe(original);
  });

  it('wraps null / undefined throwables without crashing', async () => {
    mockedRequest.mockRejectedValueOnce(null);

    let caught: unknown;
    try {
      await executeHttpRequest(
        { id: 'broker-server-status', name: 'Broker Server Healthcheck' },
        httpOptions,
      );
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain('broker-server-status');
    expect((caught as Error).cause).toBeNull();
  });

  it('does not double-prefix when called twice with different check ids', async () => {
    const err1 = new Error('boom');
    const err2 = new Error('boom');
    mockedRequest.mockRejectedValueOnce(err1).mockRejectedValueOnce(err2);

    let caught1: any, caught2: any;
    try {
      await executeHttpRequest({ id: 'check-a', name: 'A' }, httpOptions);
    } catch (e) {
      caught1 = e;
    }
    try {
      await executeHttpRequest({ id: 'check-b', name: 'B' }, httpOptions);
    } catch (e) {
      caught2 = e;
    }

    expect(caught1.message).toContain('check-a');
    expect(caught1.message).not.toContain('check-b');
    expect(caught2.message).toContain('check-b');
    expect(caught2.message).not.toContain('check-a');
  });
});
