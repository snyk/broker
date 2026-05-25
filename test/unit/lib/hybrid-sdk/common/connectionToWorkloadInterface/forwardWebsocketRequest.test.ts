import { log as logger } from '../../../../../../lib/logs/logger';
import { isUUID } from '../../../../../../lib/hybrid-sdk/common/utils/uuid';
import { forwardWebSocketRequest } from '../../../../../../lib/hybrid-sdk/common/connectionToWorkloadInterface/forwardWebsocketRequest';

jest.mock('../../../../../../lib/logs/logger');
jest.mock('../../../../../../lib/hybrid-sdk/workloadFactory', () => ({
  Workload: {
    instantiate: jest.fn(),
  },
  WorkloadType: { remoteServer: 'remote-server' },
}));

import { Workload } from '../../../../../../lib/hybrid-sdk/workloadFactory';

const mockWorkloadInstantiate = Workload.instantiate as jest.MockedFunction<
  typeof Workload.instantiate
>;

const VALID_UUID = '00000000-0000-4000-8000-000000000000';

function makeOptions() {
  return {
    config: {
      remoteWorkloadName: 'broker',
      remoteWorkloadModulePath: undefined,
    },
  } as any;
}

function makeWebsocketHandler() {
  return {} as any;
}

async function runHandler(
  payload: Record<string, any>,
  connectionIdentifier = 'conn-123',
) {
  const mockHandler = jest.fn();
  mockWorkloadInstantiate.mockResolvedValue({ handler: mockHandler } as any);

  const emit = jest.fn();
  await forwardWebSocketRequest(
    makeOptions(),
    makeWebsocketHandler(),
  )(connectionIdentifier)(payload as any, emit);

  return {
    mockHandler,
    capturedPayload: mockHandler.mock.calls[0]?.[0]?.payload,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('forwardWebSocketRequest — snyk-request-id backfill', () => {
  it('synthesises a UUID when snyk-request-id is absent', async () => {
    const payload = { url: '/foo', method: 'GET', headers: {} };
    const { capturedPayload } = await runHandler(payload);

    expect(isUUID(capturedPayload.headers['snyk-request-id'])).toBe(true);
  });

  it('leaves a valid UUID unchanged', async () => {
    const payload = {
      url: '/bar',
      method: 'POST',
      headers: { 'snyk-request-id': VALID_UUID },
    };
    const { capturedPayload } = await runHandler(payload);

    expect(capturedPayload.headers['snyk-request-id']).toBe(VALID_UUID);
  });

  it('replaces a non-UUID string with a synthesised UUID', async () => {
    const payload = {
      url: '/baz',
      method: 'DELETE',
      headers: { 'snyk-request-id': 'not-a-uuid' },
    };
    const { capturedPayload } = await runHandler(payload);

    const synthesised = capturedPayload.headers['snyk-request-id'];
    expect(synthesised).not.toBe('not-a-uuid');
    expect(isUUID(synthesised)).toBe(true);
  });

  it('handles undefined headers — creates headers object and synthesises UUID', async () => {
    const payload = { url: '/qux', method: 'PUT', headers: undefined };
    const { capturedPayload } = await runHandler(payload);

    expect(capturedPayload.headers).toBeDefined();
    expect(isUUID(capturedPayload.headers['snyk-request-id'])).toBe(true);
  });

  it('replaces the nil UUID with a synthesised UUID', async () => {
    const NIL_UUID = '00000000-0000-0000-0000-000000000000';
    const payload = {
      url: '/nil',
      method: 'GET',
      headers: { 'snyk-request-id': NIL_UUID },
    };
    const { capturedPayload } = await runHandler(payload);

    const synthesised = capturedPayload.headers['snyk-request-id'];
    expect(synthesised).not.toBe(NIL_UUID);
    expect(isUUID(synthesised)).toBe(true);
  });

  describe('regression guard: dead debug branch is removed', () => {
    it('never logs the old "Header Snyk-Request-Id not included" debug message', async () => {
      const payload = { url: '/', method: 'GET', headers: {} };
      await runHandler(payload);

      const debugCalls = (logger.debug as jest.Mock).mock.calls;
      const oldMessage = debugCalls.some(
        (args) =>
          typeof args[args.length - 1] === 'string' &&
          args[args.length - 1].includes(
            'Header Snyk-Request-Id not included in headers passed through',
          ),
      );
      expect(oldMessage).toBe(false);
    });
  });
});

describe('forwardWebSocketRequest — payload.requestId typed accessor', () => {
  it('sets payload.requestId to the synthesised UUID when header was absent', async () => {
    const payload = { url: '/foo', method: 'GET', headers: {} };
    const { capturedPayload } = await runHandler(payload);

    expect(capturedPayload.requestId).toBe(
      capturedPayload.headers['snyk-request-id'],
    );
    expect(isUUID(capturedPayload.requestId)).toBe(true);
  });

  it('sets payload.requestId to the existing valid UUID', async () => {
    const payload = {
      url: '/bar',
      method: 'GET',
      headers: { 'snyk-request-id': VALID_UUID },
    };
    const { capturedPayload } = await runHandler(payload);

    expect(capturedPayload.requestId).toBe(VALID_UUID);
    expect(capturedPayload.requestId).toBe(
      capturedPayload.headers['snyk-request-id'],
    );
  });

  it('payload.requestId matches headers entry in every case', async () => {
    for (const headerValue of [
      undefined,
      'not-a-uuid',
      '00000000-0000-0000-0000-000000000000',
      VALID_UUID,
    ]) {
      const headers = headerValue ? { 'snyk-request-id': headerValue } : {};
      const { capturedPayload } = await runHandler({
        url: '/',
        method: 'GET',
        headers,
      });

      expect(capturedPayload.requestId).toBe(
        capturedPayload.headers['snyk-request-id'],
      );
      expect(isUUID(capturedPayload.requestId)).toBe(true);
    }
  });
});
