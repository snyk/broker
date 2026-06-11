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
        requestId: 'req-1',
        integrationType: 'github',
      },
    } as any);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'SEND_BACK_FAILED',
        requestId: 'req-1',
        integrationType: 'github',
        clientTs: 999,
      }),
      'broker client event',
    );
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
