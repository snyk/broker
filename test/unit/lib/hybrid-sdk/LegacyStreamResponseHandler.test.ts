import { PassThrough, Writable } from 'node:stream';
import NodeCache from 'node-cache';
import { legacyStreamResponseHandler } from '../../../../lib/hybrid-sdk/LegacyStreamResponseHandler';
import { PendingResponseRegistry } from '../../../../lib/hybrid-sdk/http/server-post-stream-handler';
import { getDesensitizedToken } from '../../../../lib/hybrid-sdk/server/utils/token';
import { log as logger } from '../../../../lib/logs/logger';

jest.mock('../../../../lib/logs/logger', () => ({
  log: {
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

const createResponse = () => {
  const body: Buffer[] = [];
  const response = Object.assign(new PassThrough(), {
    status: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
  });
  response.on('data', (chunk) => body.push(chunk));
  return { response, body };
};

const createDelayedResponse = () => {
  const body: Buffer[] = [];
  let signalFinalStarted!: () => void;
  let releaseFinal!: () => void;
  const finalStarted = new Promise<void>((resolve) => {
    signalFinalStarted = resolve;
  });
  const finalReleased = new Promise<void>((resolve) => {
    releaseFinal = resolve;
  });
  const response = Object.assign(
    new Writable({
      write(chunk: Buffer, _encoding, callback) {
        body.push(Buffer.from(chunk));
        callback();
      },
      final(callback) {
        signalFinalStarted();
        void finalReleased.then(() => callback());
      },
    }),
    {
      status: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
    },
  );
  return { response, body, finalStarted, releaseFinal };
};

const expectSafeFailedClaimLog = (
  token: string,
  streamingID: string,
  claimStatus: 'owner-mismatch' | 'not-found' | 'already-claimed',
) => {
  const [logRecord, message] = (logger.warn as jest.Mock).mock.calls.at(-1);

  expect(logRecord).toEqual({
    streamingID,
    claimStatus,
    ...getDesensitizedToken(token),
  });
  expect(logRecord).not.toHaveProperty('token');
  expect(JSON.stringify(logRecord)).not.toContain(token);
  expect(message).toBe('Trying to write into a closed or claimed stream.');
};

describe('hybrid-sdk', () => {
  describe('legacyStreamResponseHandler()', () => {
    let cache: NodeCache;
    let registry: PendingResponseRegistry;

    beforeEach(() => {
      jest.clearAllMocks();
      cache = new NodeCache({ useClones: false, checkperiod: 0 });
      registry = new PendingResponseRegistry(cache);
    });

    afterEach(() => {
      registry.dispose();
      cache.close();
    });

    it('claims a pending response once and forwards WebSocket chunks', async () => {
      const { response, body } = createResponse();
      registry.register('stream-1', {
        response: response as any,
        brokerAppClientId: null,
        legacyConnectionIdentifier: 'token',
      });
      const handleChunk = legacyStreamResponseHandler('token', registry);
      const finished = new Promise<void>((resolve) =>
        response.once('finish', resolve),
      );

      handleChunk('stream-1', Buffer.from('first'), false, {
        status: 206,
        headers: { 'content-type': 'text/plain' },
      });
      expect(registry.claim('stream-1')).toEqual({
        status: 'already-claimed',
      });
      handleChunk('stream-1', Buffer.from('-second'), true);
      await finished;

      expect(response.status).toHaveBeenCalledWith(206);
      expect(response.set).toHaveBeenCalledWith({
        'content-type': 'text/plain',
      });
      expect(Buffer.concat(body).toString()).toBe('first-second');
      await new Promise((resolve) => setImmediate(resolve));
      expect(registry.claim('stream-1')).toEqual({ status: 'not-found' });
    });

    it('cancels all unfinished deliveries when its handler is disposed', async () => {
      const first = createResponse();
      const second = createResponse();
      registry.register('stream-1', {
        response: first.response as any,
        brokerAppClientId: null,
        legacyConnectionIdentifier: 'token',
      });
      registry.register('stream-2', {
        response: second.response as any,
        brokerAppClientId: null,
        legacyConnectionIdentifier: 'token',
      });
      const handleChunk = legacyStreamResponseHandler('token', registry);

      handleChunk('stream-1', Buffer.from('first'), false, { status: 200 });
      handleChunk('stream-2', Buffer.from('second'), false, { status: 200 });
      expect(registry.claim('stream-1')).toEqual({
        status: 'already-claimed',
      });
      expect(registry.claim('stream-2')).toEqual({
        status: 'already-claimed',
      });

      const closed = [first.response, second.response].map(
        (response) =>
          new Promise<void>((resolve) => response.once('close', resolve)),
      );
      handleChunk.dispose(new Error('socket closed'));
      handleChunk.dispose(new Error('socket closed again'));
      await Promise.all(closed);
      await new Promise((resolve) => setImmediate(resolve));

      expect(first.response.destroyed).toBe(true);
      expect(second.response.destroyed).toBe(true);
      expect(registry.claim('stream-1')).toEqual({ status: 'not-found' });
      expect(registry.claim('stream-2')).toEqual({ status: 'not-found' });
    });

    it('only cancels deliveries owned by the disposed handler', async () => {
      const first = createResponse();
      const second = createResponse();
      const token = 'shared-token';
      registry.register('stream-a', {
        response: first.response as any,
        brokerAppClientId: null,
        legacyConnectionIdentifier: token,
      });
      registry.register('stream-b', {
        response: second.response as any,
        brokerAppClientId: null,
        legacyConnectionIdentifier: token,
      });
      const firstHandler = legacyStreamResponseHandler(token, registry);
      const secondHandler = legacyStreamResponseHandler(token, registry);

      firstHandler('stream-a', Buffer.from('a'), false, { status: 200 });
      secondHandler('stream-b', Buffer.from('b'), false, { status: 200 });
      const firstClosed = new Promise<void>((resolve) =>
        first.response.once('close', resolve),
      );

      firstHandler.dispose(new Error('first socket closed'));
      await firstClosed;
      await new Promise((resolve) => setImmediate(resolve));

      expect(registry.claim('stream-a')).toEqual({ status: 'not-found' });
      expect(registry.claim('stream-b')).toEqual({
        status: 'already-claimed',
      });

      const secondFinished = new Promise<void>((resolve) =>
        second.response.once('finish', resolve),
      );
      secondHandler('stream-b', Buffer.from('-done'), true);
      await secondFinished;
      await new Promise((resolve) => setImmediate(resolve));

      expect(Buffer.concat(second.body).toString()).toBe('b-done');
      expect(registry.claim('stream-b')).toEqual({ status: 'not-found' });
      secondHandler.dispose(new Error('already completed'));
    });

    it('preserves completion when disposed after the final chunk', async () => {
      const { response, body, finalStarted, releaseFinal } =
        createDelayedResponse();
      registry.register('stream-1', {
        response: response as any,
        brokerAppClientId: null,
        legacyConnectionIdentifier: 'token',
      });
      const handleChunk = legacyStreamResponseHandler('token', registry);
      const finished = new Promise<void>((resolve) =>
        response.once('finish', resolve),
      );

      handleChunk('stream-1', Buffer.from('first'), false, { status: 200 });
      handleChunk('stream-1', Buffer.from('-final'), true);
      await finalStarted;

      expect(response.writableFinished).toBe(false);
      expect(registry.claim('stream-1')).toEqual({
        status: 'already-claimed',
      });

      handleChunk.dispose(new Error('socket closed after final chunk'));

      expect(response.destroyed).toBe(false);
      expect(logger.error).not.toHaveBeenCalled();
      releaseFinal();
      await finished;
      await new Promise((resolve) => setImmediate(resolve));

      expect(Buffer.concat(body).toString()).toBe('first-final');
      expect(registry.claim('stream-1')).toEqual({ status: 'not-found' });
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('ignores chunks received after disposal without claiming a response', () => {
      const { response } = createResponse();
      registry.register('stream-1', {
        response: response as any,
        brokerAppClientId: null,
        legacyConnectionIdentifier: 'token',
      });
      const handleChunk = legacyStreamResponseHandler('token', registry);

      handleChunk.dispose(new Error('socket closed'));
      handleChunk('stream-1', Buffer.from('late'), true, { status: 200 });

      expect(response.status).not.toHaveBeenCalled();
      const claim = registry.claim('stream-1', {
        legacyConnectionIdentifier: 'token',
        enforceLegacyOwnership: true,
      });
      expect(claim.status).toBe('claimed');
      if (claim.status === 'claimed') {
        claim.pending.cancel();
      }
    });

    it('safely logs when POST delivery claimed the response first', async () => {
      const { response, body } = createResponse();
      const token = 'already-claimed-owner-token';
      registry.register('stream-1', {
        response: response as any,
        brokerAppClientId: null,
        legacyConnectionIdentifier: token,
      });
      expect(registry.claim('stream-1').status).toBe('claimed');

      legacyStreamResponseHandler(token, registry)(
        'stream-1',
        Buffer.from('must-not-be-written'),
        true,
        { status: 200 },
      );
      await new Promise((resolve) => setImmediate(resolve));

      expect(response.status).not.toHaveBeenCalled();
      expect(body).toEqual([]);
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expectSafeFailedClaimLog(token, 'stream-1', 'already-claimed');
    });

    it('safely logs and preserves the claim when ownership does not match', () => {
      const { response } = createResponse();
      const token = 'wrong-owner-token-that-must-not-be-logged';
      registry.register('stream-1', {
        response: response as any,
        brokerAppClientId: null,
        legacyConnectionIdentifier: 'right-token',
      });

      legacyStreamResponseHandler(token, registry)(
        'stream-1',
        Buffer.from('must-not-be-written'),
        true,
        { status: 200 },
      );

      expect(response.status).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expectSafeFailedClaimLog(token, 'stream-1', 'owner-mismatch');
      expect(
        registry.claim('stream-1', {
          enforceLegacyOwnership: true,
          legacyConnectionIdentifier: 'right-token',
        }).status,
      ).toBe('claimed');
    });

    it('safely logs when the pending response is not found', () => {
      const token = 'not-found-owner-token';

      legacyStreamResponseHandler(token, registry)(
        'missing-stream',
        Buffer.from('must-not-be-written'),
        true,
        { status: 200 },
      );

      expect(logger.warn).toHaveBeenCalledTimes(1);
      expectSafeFailedClaimLog(token, 'missing-stream', 'not-found');
    });
  });
});
