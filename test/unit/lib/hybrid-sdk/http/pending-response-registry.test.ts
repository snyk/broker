import { PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import NodeCache from 'node-cache';
import { observeResponseSize } from '../../../../../lib/hybrid-sdk/common/utils/metrics';
import { PendingResponseRegistry } from '../../../../../lib/hybrid-sdk/http/server-post-stream-handler';

jest.mock('../../../../../lib/hybrid-sdk/common/utils/metrics', () => ({
  observeResponseSize: jest.fn(),
}));

const createRegistration = (brokerAppClientId = 'broker-a') => {
  const response = Object.assign(new PassThrough(), {
    status: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
  });
  const errors: Error[] = [];
  response.on('error', (error) => errors.push(error));
  response.resume();
  return {
    registration: {
      response: response as any,
      brokerAppClientId,
      legacyConnectionIdentifier: 'legacy-a',
    },
    response,
    errors,
  };
};

describe('hybrid-sdk/http', () => {
  describe('PendingResponseRegistry', () => {
    let cache: NodeCache;
    let registry: PendingResponseRegistry;

    beforeEach(() => {
      cache = new NodeCache({ useClones: false, checkperiod: 0 });
      registry = new PendingResponseRegistry(cache);
      jest.clearAllMocks();
    });

    afterEach(() => {
      registry.dispose();
      cache.close();
      jest.useRealTimers();
    });

    it('grants a one-shot claim when the response is pending', () => {
      const { registration, response } = createRegistration();
      registry.register('stream-1', registration);

      const first = registry.claim('stream-1');
      const duplicate = registry.claim('stream-1');

      expect(first.status).toBe('claimed');
      expect(duplicate).toEqual({ status: 'already-claimed' });
      if (first.status === 'claimed') {
        expect(first.pending.destination).toBe(response);
      }
    });

    it('preserves the claim when broker ownership differs', () => {
      const { registration } = createRegistration();
      registry.register('stream-1', registration);

      expect(
        registry.claim('stream-1', {
          enforceBrokerOwnership: true,
          brokerAppClientId: 'broker-b',
        }),
      ).toEqual({ status: 'owner-mismatch' });
      expect(
        registry.claim('stream-1', {
          enforceBrokerOwnership: true,
          brokerAppClientId: 'broker-a',
        }).status,
      ).toBe('claimed');
    });

    it('preserves the claim when legacy connection ownership differs', () => {
      const { registration } = createRegistration();
      registry.register('stream-1', registration);

      expect(
        registry.claim('stream-1', {
          enforceLegacyOwnership: true,
          legacyConnectionIdentifier: 'legacy-b',
        }),
      ).toEqual({ status: 'owner-mismatch' });
      expect(
        registry.claim('stream-1', {
          enforceLegacyOwnership: true,
          legacyConnectionIdentifier: 'legacy-a',
        }).status,
      ).toBe('claimed');
    });

    it('rejects registration when the streaming ID is already pending or claimed', () => {
      const first = createRegistration();
      const replacement = createRegistration();
      registry.register('stream-1', first.registration);

      expect(() =>
        registry.register('stream-1', replacement.registration),
      ).toThrow('Pending response stream-1 is already registered.');
      expect(registry.claim('stream-1').status).toBe('claimed');
      expect(() =>
        registry.register('stream-1', replacement.registration),
      ).toThrow('Pending response stream-1 is already registered.');
      expect(replacement.response.listenerCount('close')).toBe(0);
    });

    it('returns destination-unavailable when the response is already destroyed', () => {
      const { registration, response } = createRegistration();
      response.destroy();

      expect(registry.register('stream-1', registration)).toEqual({
        status: 'destination-unavailable',
      });

      expect(registry.claim('stream-1')).toEqual({ status: 'not-found' });
      expect(response.listenerCount('close')).toBe(0);
      expect(response.listenerCount('error')).toBe(1);
    });

    it('destroys the response when it is canceled before being claimed', async () => {
      const { registration, response, errors } = createRegistration();
      registry.register('stream-1', registration);
      const cancellation = new Error('requester disconnected');

      expect(registry.cancel('stream-1', cancellation)).toBe(true);
      await new Promise((resolve) => setImmediate(resolve));

      expect(response.destroyed).toBe(true);
      expect(errors).toEqual([cancellation]);
      expect(registry.claim('stream-1')).toEqual({ status: 'not-found' });
    });

    it('releases an active claim when the requester disconnects', () => {
      const { registration, response } = createRegistration();
      registry.register('stream-1', registration);
      const claim = registry.claim('stream-1');
      if (claim.status !== 'claimed') {
        throw new Error('expected claim');
      }

      response.emit('close');

      expect(claim.pending.complete(1)).toBe(false);
      expect(registry.claim('stream-1')).toEqual({ status: 'not-found' });
    });

    it('removes an unclaimed response when it finishes independently', async () => {
      const { registration, response } = createRegistration();
      registry.register('stream-1', registration);

      const closed = new Promise((resolve) => response.once('close', resolve));
      response.end();
      await closed;

      expect(registry.claim('stream-1')).toEqual({ status: 'not-found' });
    });

    it('destroys an unclaimed response when its registration expires', () => {
      jest.useFakeTimers();
      const { registration, response } = createRegistration();
      registry.register('stream-1', registration, 0.01);

      jest.advanceTimersByTime(20);

      expect(registry.claim('stream-1')).toEqual({ status: 'not-found' });
      expect(response.destroyed).toBe(true);
    });

    it('returns not-found when the registration expires during acquisition', () => {
      jest.useFakeTimers();
      jest.setSystemTime(1_000);
      const { registration, response } = createRegistration();
      registry.register('stream-1', registration, 0.01);
      const expiresAt = cache.getTtl('stream-1');
      if (!expiresAt) {
        throw new Error('expected cache expiry');
      }
      jest.setSystemTime(expiresAt);
      const take = jest.spyOn(cache, 'take').mockImplementation((key) => {
        jest.setSystemTime(expiresAt + 1);
        return NodeCache.prototype.take.call(cache, key);
      });

      const claim = registry.claim('stream-1');

      expect(take).toHaveReturnedWith(undefined);
      expect(claim).toEqual({ status: 'not-found' });
      expect(response.destroyed).toBe(true);
      expect(cache.has('stream-1')).toBe(false);
    });

    it('keeps a claim active when its registration deadline passes', () => {
      jest.useFakeTimers();
      jest.setSystemTime(1_000);
      const { registration, response } = createRegistration();
      registry.register('stream-1', registration, 0.01);
      jest.advanceTimersByTime(9);
      const claim = registry.claim('stream-1');
      if (claim.status !== 'claimed') {
        throw new Error('expected claim');
      }

      jest.advanceTimersByTime(2);

      expect(response.destroyed).toBe(false);
      expect(claim.pending.complete(1)).toBe(true);
      expect(registry.claim('stream-1')).toEqual({ status: 'not-found' });
    });

    it('allows claimed delivery to finish after its registration deadline', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(1_000);
      const { registration, response } = createRegistration();
      const received: Buffer[] = [];
      response.on('data', (chunk) => received.push(chunk));
      registry.register('stream-1', registration, 0.01);
      jest.advanceTimersByTime(9);
      const claim = registry.claim('stream-1');
      if (claim.status !== 'claimed') {
        throw new Error('expected claim');
      }
      const source = new PassThrough();
      const transfer = pipeline(source, claim.pending.destination);

      source.write(Buffer.from('before-'));
      jest.advanceTimersByTime(2);
      source.end(Buffer.from('after'));
      await transfer;

      expect(Buffer.concat(received).toString()).toBe('before-after');
      expect(response.destroyed).toBe(true);
      expect(response.errored).toBeNull();
      expect(claim.pending.complete(12)).toBe(true);
      expect(observeResponseSize).toHaveBeenCalledWith({
        bytes: 12,
        isStreaming: true,
      });
    });

    it('settles only once when completion and cancellation are repeated', () => {
      const { registration, response } = createRegistration();
      registry.register('stream-1', registration);
      const claim = registry.claim('stream-1');
      if (claim.status !== 'claimed') {
        throw new Error('expected claim');
      }

      expect(claim.pending.complete(42)).toBe(true);
      expect(claim.pending.complete(42)).toBe(false);
      expect(claim.pending.cancel(new Error('late cancel'))).toBe(false);
      response.emit('close');

      expect(response.destroyed).toBe(false);
      expect(observeResponseSize).toHaveBeenCalledTimes(1);
      expect(observeResponseSize).toHaveBeenCalledWith({
        bytes: 42,
        isStreaming: true,
      });
      expect(response.listenerCount('close')).toBe(0);
      expect(response.listenerCount('error')).toBe(1);
      expect(registry.claim('stream-1')).toEqual({ status: 'not-found' });
    });

    it('rejects metadata when response headers are already committed', () => {
      const { registration, response } = createRegistration();
      registry.register('stream-1', registration);
      const claim = registry.claim('stream-1');
      if (claim.status !== 'claimed') {
        throw new Error('expected claim');
      }
      Object.assign(response, { headersSent: true });

      expect(() => claim.pending.applyMetadata({ status: 500 })).toThrow(
        'Pending response stream-1 cannot accept response metadata.',
      );
      expect(response.status).not.toHaveBeenCalled();
      expect(response.set).not.toHaveBeenCalled();
      expect(claim.pending.cancel()).toBe(true);
      expect(response.listenerCount('close')).toBe(0);
      expect(response.listenerCount('error')).toBe(1);
    });

    it('destroys the destination once when an active claim is canceled repeatedly', async () => {
      const { registration, response, errors } = createRegistration();
      registry.register('stream-1', registration);
      const claim = registry.claim('stream-1');
      if (claim.status !== 'claimed') {
        throw new Error('expected claim');
      }
      const error = new Error('delivery failed');

      expect(claim.pending.cancel(error)).toBe(true);
      expect(claim.pending.cancel(error)).toBe(false);
      await new Promise((resolve) => setImmediate(resolve));

      expect(response.destroyed).toBe(true);
      expect(errors).toEqual([error]);
      expect(observeResponseSize).not.toHaveBeenCalled();
    });
  });
});
