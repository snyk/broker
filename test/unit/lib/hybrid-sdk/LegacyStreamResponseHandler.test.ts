import { PassThrough } from 'node:stream';
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
