import { log as logger } from '../../../../../../lib/logs/logger';
import {
  ClientEventIdentity,
  handleClientEvent,
} from '../../../../../../lib/hybrid-sdk/server/socketHandlers/clientEventHandler';
import { PROCESS_EXIT_REASONS } from '../../../../../../lib/hybrid-sdk/common/types/telemetry';

describe('handleClientEvent', () => {
  let infoSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  // Server-owned identity captured at identify time.
  const identity: ClientEventIdentity = {
    hashedToken: 'server-hash',
    maskedToken: 'serv-oken',
    clientId: 'server-client-id',
    clientVersion: '4.200.0',
    mode: 'universal',
    deploymentId: 'deploy-1',
  };

  beforeEach(() => {
    infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => logger);
    warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger);
  });
  afterEach(() => jest.restoreAllMocks());

  it('stamps server-owned identity LAST, so a spoofed payload cannot override it', () => {
    handleClientEvent(identity)({
      ts: 123,
      event: {
        type: 'client-error',
        errorCode: 'JWT_REFRESH_FAILED',
        // Spoofed identity fields — must be ignored.
        hashedToken: 'ATTACKER-HASH',
        clientId: 'attacker',
        deploymentId: 'attacker-deploy',
      },
    } as any);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        hashedToken: 'server-hash',
        clientId: 'server-client-id',
        deploymentId: 'deploy-1',
        errorCode: 'JWT_REFRESH_FAILED',
        eventType: 'client-error',
        clientTs: 123,
      }),
      'broker client event',
    );
  });

  it('forwards bounded non-identity fields and the client ts into the log line', () => {
    handleClientEvent(identity)({
      ts: 999,
      event: {
        type: 'client-error',
        errorCode: 'SEND_BACK_FAILED',
        requestId: '77777777-7777-4777-8777-777777777777',
        integrationType: 'github',
      },
    } as any);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'SEND_BACK_FAILED',
        requestId: '77777777-7777-4777-8777-777777777777',
        integrationType: 'github',
        clientTs: 999,
      }),
      'broker client event',
    );
  });

  describe('clientTs validation and serverTs', () => {
    it('passes through a finite numeric clientTs and always logs a numeric serverTs', () => {
      handleClientEvent(identity)({
        ts: 1000,
        event: { type: 'client-error', errorCode: 'JWT_REFRESH_FAILED' },
      } as any);
      const loggedObj = warnSpy.mock.calls[0][0];
      expect(loggedObj.clientTs).toBe(1000);
      expect(typeof loggedObj.serverTs).toBe('number');
      expect(Number.isFinite(loggedObj.serverTs)).toBe(true);
    });

    it('replaces NaN clientTs with undefined and still logs a numeric serverTs', () => {
      handleClientEvent(identity)({
        ts: NaN,
        event: { type: 'client-error', errorCode: 'JWT_REFRESH_FAILED' },
      } as any);
      const loggedObj = warnSpy.mock.calls[0][0];
      expect(loggedObj.clientTs).toBeUndefined();
      expect(typeof loggedObj.serverTs).toBe('number');
      expect(Number.isFinite(loggedObj.serverTs)).toBe(true);
    });

    it('treats a sub-object ts as invalid and strips clientTs', () => {
      handleClientEvent(identity)({
        ts: { $gt: 0 } as any,
        event: { type: 'client-error', errorCode: 'JWT_REFRESH_FAILED' },
      } as any);
      const loggedObj = warnSpy.mock.calls[0][0];
      expect(loggedObj.clientTs).toBeUndefined();
    });
  });

  describe('eventType capping and validation', () => {
    it('caps a very long event type to 64 chars before logging', () => {
      const longType = 'z'.repeat(200);
      handleClientEvent(identity)({
        ts: 1,
        event: { type: longType, someField: 'x' } as any,
      } as any);
      const loggedObj = infoSpy.mock.calls[0][0];
      expect(loggedObj.eventType).toHaveLength(64);
      expect(loggedObj.eventType).toBe('z'.repeat(64));
    });

    it('replaces an eventType containing special characters with "unknown"', () => {
      handleClientEvent(identity)({
        ts: 1,
        event: { type: 'type with spaces', someField: 'x' } as any,
      } as any);
      const loggedObj = infoSpy.mock.calls[0][0];
      expect(loggedObj.eventType).toBe('unknown');
    });

    it('passes through a future event type that matches the safe-label pattern', () => {
      handleClientEvent(identity)({
        ts: 1,
        event: { type: 'future-event-v2' } as any,
      } as any);
      const loggedObj = infoSpy.mock.calls[0][0];
      expect(loggedObj.eventType).toBe('future-event-v2');
    });
  });

  describe('sanitizeEventFields — unknown/forward-compat fields', () => {
    it('drops an unknown field whose value is an object (only scalars allowed)', () => {
      handleClientEvent(identity)({
        ts: 1,
        event: {
          type: 'future-event',
          nestedPayload: { deep: 'data', count: 99 },
        } as any,
      } as any);
      const loggedObj = infoSpy.mock.calls[0][0];
      expect(loggedObj.nestedPayload).toBeUndefined();
    });

    it('drops an unknown field whose value is an array', () => {
      handleClientEvent(identity)({
        ts: 1,
        event: {
          type: 'future-event',
          tags: ['a', 'b', 'c'],
        } as any,
      } as any);
      const loggedObj = infoSpy.mock.calls[0][0];
      expect(loggedObj.tags).toBeUndefined();
    });

    it('passes through an unknown field with a short scalar string value', () => {
      handleClientEvent(identity)({
        ts: 1,
        event: {
          type: 'future-event',
          futureLabel: 'some-value',
        } as any,
      } as any);
      const loggedObj = infoSpy.mock.calls[0][0];
      expect(loggedObj.futureLabel).toBe('some-value');
    });

    it('caps an unknown string field value at 256 chars', () => {
      handleClientEvent(identity)({
        ts: 1,
        event: {
          type: 'future-event',
          longField: 'a'.repeat(500),
        } as any,
      } as any);
      const loggedObj = infoSpy.mock.calls[0][0];
      expect(loggedObj.longField).toHaveLength(256);
    });

    it('passes through an unknown boolean field', () => {
      handleClientEvent(identity)({
        ts: 1,
        event: {
          type: 'future-event',
          isRetry: true,
        } as any,
      } as any);
      const loggedObj = infoSpy.mock.calls[0][0];
      expect(loggedObj.isRetry).toBe(true);
    });

    it('drops an unknown field carrying NaN (not a finite number)', () => {
      handleClientEvent(identity)({
        ts: 1,
        event: {
          type: 'future-event',
          count: NaN,
        } as any,
      } as any);
      const loggedObj = infoSpy.mock.calls[0][0];
      expect(loggedObj.count).toBeUndefined();
    });

    it('drops an unknown field carrying Infinity', () => {
      handleClientEvent(identity)({
        ts: 1,
        event: {
          type: 'future-event',
          count: Infinity,
        } as any,
      } as any);
      const loggedObj = infoSpy.mock.calls[0][0];
      expect(loggedObj.count).toBeUndefined();
    });

    it('passes through an unknown field carrying a finite number', () => {
      handleClientEvent(identity)({
        ts: 1,
        event: {
          type: 'future-event',
          retryCount: 3,
        } as any,
      } as any);
      const loggedObj = infoSpy.mock.calls[0][0];
      expect(loggedObj.retryCount).toBe(3);
    });
  });

  describe('sanitizeEventFields extended', () => {
    it('strips an errorCode that is not a known BrokerErrorCode or OS errno', () => {
      handleClientEvent(identity)({
        ts: 1,
        event: {
          type: 'client-shutdown',
          reason: 'clean',
          uptimeSeconds: 5,
          errorCode: 'ERR_TLS_CERT_ALTNAME_INVALID',
        },
      } as any);
      const loggedObj = infoSpy.mock.calls[0][0];
      expect(loggedObj.errorCode).toBeUndefined();
    });

    it('keeps a known OS errno errorCode on client-shutdown', () => {
      handleClientEvent(identity)({
        ts: 1,
        event: {
          type: 'client-shutdown',
          reason: 'clean',
          uptimeSeconds: 5,
          errorCode: 'ECONNRESET',
        },
      } as any);
      const loggedObj = infoSpy.mock.calls[0][0];
      expect(loggedObj.errorCode).toBe('ECONNRESET');
    });

    it('keeps a known BrokerErrorCode on client-error', () => {
      handleClientEvent(identity)({
        ts: 1,
        event: { type: 'client-error', errorCode: 'JWT_REFRESH_FAILED' },
      } as any);
      const loggedObj = warnSpy.mock.calls[0][0];
      expect(loggedObj.errorCode).toBe('JWT_REFRESH_FAILED');
    });

    it('strips a non-finite uptimeSeconds', () => {
      handleClientEvent(identity)({
        ts: 1,
        event: {
          type: 'client-shutdown',
          reason: 'clean',
          uptimeSeconds: Infinity,
        },
      } as any);
      const loggedObj = infoSpy.mock.calls[0][0];
      expect(loggedObj.uptimeSeconds).toBeUndefined();
    });

    it('strips a negative uptimeSeconds', () => {
      handleClientEvent(identity)({
        ts: 1,
        event: { type: 'client-shutdown', reason: 'clean', uptimeSeconds: -1 },
      } as any);
      const loggedObj = infoSpy.mock.calls[0][0];
      expect(loggedObj.uptimeSeconds).toBeUndefined();
    });

    it('keeps a valid finite non-negative uptimeSeconds', () => {
      handleClientEvent(identity)({
        ts: 1,
        event: { type: 'client-shutdown', reason: 'clean', uptimeSeconds: 42 },
      } as any);
      const loggedObj = infoSpy.mock.calls[0][0];
      expect(loggedObj.uptimeSeconds).toBe(42);
    });

    it('strips a reason that contains non-alphanumeric characters', () => {
      handleClientEvent(identity)({
        ts: 1,
        event: {
          type: 'client-shutdown',
          reason: '<script>alert(1)</script>',
          uptimeSeconds: 1,
        },
      } as any);
      const loggedObj = infoSpy.mock.calls[0][0];
      expect(loggedObj.reason).toBeUndefined();
    });

    it('keeps a valid enum-shaped reason', () => {
      handleClientEvent(identity)({
        ts: 1,
        event: { type: 'client-shutdown', reason: 'clean', uptimeSeconds: 1 },
      } as any);
      const loggedObj = infoSpy.mock.calls[0][0];
      expect(loggedObj.reason).toBe('clean');
    });
  });

  describe('sanitizeEventFields', () => {
    it('truncates an oversized integrationType to 64 chars before logging', () => {
      const longType = 'a'.repeat(200);
      handleClientEvent(identity)({
        ts: 1,
        event: {
          type: 'client-error',
          errorCode: 'JWT_REFRESH_FAILED',
          integrationType: longType,
        },
      } as any);
      const loggedObj = warnSpy.mock.calls[0][0];
      expect(loggedObj.integrationType).toHaveLength(64);
    });

    it('drops an integrationType that contains characters outside alphanumeric/dash/underscore', () => {
      handleClientEvent(identity)({
        ts: 1,
        event: {
          type: 'client-error',
          errorCode: 'JWT_REFRESH_FAILED',
          integrationType: '<script>alert(1)</script>',
        },
      } as any);
      const loggedObj = warnSpy.mock.calls[0][0];
      expect(loggedObj.integrationType).toBeUndefined();
    });

    it('strips a requestId that is not a valid UUID', () => {
      handleClientEvent(identity)({
        ts: 1,
        event: {
          type: 'client-error',
          errorCode: 'JWT_REFRESH_FAILED',
          requestId: 'a'.repeat(10000),
        },
      } as any);
      const loggedObj = warnSpy.mock.calls[0][0];
      expect(loggedObj.requestId).toBeUndefined();
    });

    it('keeps a valid UUID requestId', () => {
      handleClientEvent(identity)({
        ts: 1,
        event: {
          type: 'client-error',
          errorCode: 'JWT_REFRESH_FAILED',
          requestId: '77777777-7777-4777-8777-777777777777',
        },
      } as any);
      const loggedObj = warnSpy.mock.calls[0][0];
      expect(loggedObj.requestId).toBe('77777777-7777-4777-8777-777777777777');
    });
  });

  describe('severity', () => {
    it('logs client-error at warn', () => {
      handleClientEvent(identity)({
        ts: 1,
        event: { type: 'client-error', errorCode: 'JWT_REFRESH_FAILED' },
      } as any);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.anything(),
        'broker client event',
      );
    });

    it.each([
      PROCESS_EXIT_REASONS.UNCAUGHT_EXCEPTION,
      PROCESS_EXIT_REASONS.OAUTH_TOKEN_UNAVAILABLE,
    ])('logs a fatal client-shutdown (%s) at error', (reason) => {
      handleClientEvent(identity)({
        ts: 1,
        event: { type: 'client-shutdown', reason, uptimeSeconds: 3 },
      } as any);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({ reason, eventType: 'client-shutdown' }),
        'broker client event',
      );
    });

    it.each(['clean', PROCESS_EXIT_REASONS.RECONNECT_EXHAUSTION])(
      'logs a non-fatal client-shutdown (%s) at info',
      (reason) => {
        handleClientEvent(identity)({
          ts: 1,
          event: { type: 'client-shutdown', reason, uptimeSeconds: 3 },
        } as any);
        expect(infoSpy).toHaveBeenCalledWith(
          expect.objectContaining({ reason, eventType: 'client-shutdown' }),
          'broker client event',
        );
      },
    );
  });

  it('logs an unknown event type under its raw type rather than dropping it', () => {
    handleClientEvent(identity)({
      ts: 1,
      event: { type: 'future-event', someField: 'x' },
    } as any);

    // Unknown/forward-compat types are logged at info — surfaced, never dropped.
    expect(infoSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'future-event',
        someField: 'x',
        hashedToken: 'server-hash',
      }),
      'broker client event',
    );
  });

  it.each([
    ['a missing event', { ts: 1 }],
    ['a typeless event', { ts: 1, event: { errorCode: 'X' } }],
  ])('warns and drops %s as malformed', (_label, message) => {
    handleClientEvent(identity)(message as any);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ hashedToken: 'server-hash' }),
      'Received malformed broker client event',
    );
    expect(infoSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
