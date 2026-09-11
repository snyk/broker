import { Writable } from 'node:stream';
import { Response } from 'express';
import NodeCache from 'node-cache';
import { getConfig } from '../common/config/config';
import { observeResponseSize } from '../common/utils/metrics';
import { ResponseMetadata } from './response-frame-decoder';

export interface PendingResponseRegistration {
  readonly response: Response;
  readonly brokerAppClientId: string | null;
  readonly legacyConnectionIdentifier?: string;
}

export interface ClaimOptions {
  brokerAppClientId?: string;
  enforceBrokerOwnership?: boolean;
  legacyConnectionIdentifier?: string;
  enforceLegacyOwnership?: boolean;
}

export type RegistrationResult =
  | { status: 'registered' }
  | { status: 'destination-unavailable' };

export type ClaimResult =
  | { status: 'claimed'; pending: PendingResponse }
  | { status: 'not-found' | 'already-claimed' | 'owner-mismatch' };

type Settlement =
  | { type: 'complete'; bodyBytes: number }
  | { type: 'cancel'; error?: Error };

/** A one-shot capability returned by PendingResponseRegistry.claim(). */
export class PendingResponse {
  readonly destination: Writable;

  constructor(
    readonly streamingID: string,
    private readonly response: Response,
    private readonly settle: (
      pending: PendingResponse,
      settlement: Settlement,
    ) => boolean,
  ) {
    // The original response is deliberately the destination. In particular,
    // POST delivery must not terminate at an intermediate buffer.
    this.destination = response;
  }

  applyMetadata(metadata: ResponseMetadata): void {
    if (isResponseUnavailable(this.response)) {
      throw new Error(
        `Pending response ${this.streamingID} cannot accept response metadata.`,
      );
    }
    this.response.status(metadata.status);
    if (metadata.headers) {
      this.response.set(metadata.headers);
    }
  }

  complete(bodyBytes: number): boolean {
    return this.settle(this, { type: 'complete', bodyBytes });
  }

  cancel(error?: Error): boolean {
    return this.settle(this, { type: 'cancel', error });
  }
}

interface ResponseWatchers {
  response: Response;
  onClose: () => void;
  onError: (error: Error) => void;
}

/**
 * Owns pending-response registration, broker ownership checks, one-shot claims,
 * cancellation and expiry. Cache records never escape this class.
 */
export class PendingResponseRegistry {
  private readonly activeClaims = new Map<string, PendingResponse>();
  private readonly responseWatchers = new Map<string, ResponseWatchers>();
  private readonly onExpired = (
    streamingID: string,
    registration: PendingResponseRegistration,
  ) => {
    this.expireRegistration(streamingID, registration);
  };

  private readonly expireRegistration = (
    streamingID: string,
    registration: PendingResponseRegistration,
  ) => {
    this.detachResponseWatchers(streamingID);
    if (!registration.response.destroyed) {
      registration.response.destroy();
    }
  };

  constructor(
    private readonly store: NodeCache = new NodeCache({
      stdTTL: parseInt(getConfig().cacheExpiry) || 3600, // 1 hour
      checkperiod: parseInt(getConfig().cacheCheckPeriod) || 60, // 1 min
      useClones: false,
    }),
  ) {
    this.store.on('expired', this.onExpired);
  }

  register(
    streamingID: string,
    registration: PendingResponseRegistration,
    ttlSeconds?: number,
  ): RegistrationResult {
    if (this.activeClaims.has(streamingID) || this.store.has(streamingID)) {
      throw new Error(`Pending response ${streamingID} is already registered.`);
    }
    if (isResponseUnavailable(registration.response)) {
      return { status: 'destination-unavailable' };
    }

    const storedRegistration = { ...registration };
    if (ttlSeconds === undefined) {
      this.store.set(streamingID, storedRegistration);
    } else {
      this.store.set(streamingID, storedRegistration, ttlSeconds);
    }

    const onClose = () => {
      if (storedRegistration.response.writableFinished) {
        if (!this.activeClaims.has(streamingID)) {
          this.store.del(streamingID);
        }
        this.detachResponseWatchers(streamingID);
        return;
      }
      this.cancelFromDestination(
        streamingID,
        new Error(`Original response ${streamingID} closed prematurely.`),
      );
    };
    const onError = (error: Error) =>
      this.cancelFromDestination(streamingID, error);
    storedRegistration.response.once('close', onClose);
    storedRegistration.response.once('error', onError);
    this.responseWatchers.set(streamingID, {
      response: storedRegistration.response,
      onClose,
      onError,
    });
    return { status: 'registered' };
  }

  claim(streamingID: string, options: ClaimOptions = {}): ClaimResult {
    const registration =
      this.store.get<PendingResponseRegistration>(streamingID);
    if (!registration) {
      return {
        status: this.activeClaims.has(streamingID)
          ? 'already-claimed'
          : 'not-found',
      };
    }

    if (
      (options.enforceBrokerOwnership &&
        (!options.brokerAppClientId ||
          !registration.brokerAppClientId ||
          options.brokerAppClientId !== registration.brokerAppClientId)) ||
      (options.enforceLegacyOwnership &&
        (!options.legacyConnectionIdentifier ||
          !registration.legacyConnectionIdentifier ||
          options.legacyConnectionIdentifier !==
            registration.legacyConnectionIdentifier))
    ) {
      return { status: 'owner-mismatch' };
    }

    // NodeCache revalidates expiry in take(). Treat that result as the
    // ownership boundary: a value observed by get() must not escape if it
    // expires before the cache can remove it.
    const claimedRegistration =
      this.store.take<PendingResponseRegistration>(streamingID);
    if (!claimedRegistration) {
      return {
        status: this.activeClaims.has(streamingID)
          ? 'already-claimed'
          : 'not-found',
      };
    }
    const pending = new PendingResponse(
      streamingID,
      claimedRegistration.response,
      (settledPending, settlement) => this.settle(settledPending, settlement),
    );
    this.activeClaims.set(streamingID, pending);

    return { status: 'claimed', pending };
  }

  cancel(streamingID: string, error?: Error): boolean {
    const active = this.activeClaims.get(streamingID);
    if (active) {
      return active.cancel(error);
    }

    const registration =
      this.store.get<PendingResponseRegistration>(streamingID);
    if (!registration) {
      this.detachResponseWatchers(streamingID);
      return false;
    }
    this.store.del(streamingID);
    this.detachResponseWatchers(streamingID);
    if (!registration.response.destroyed) {
      registration.response.destroy(error);
    }
    return true;
  }

  dispose(): void {
    this.store.off('expired', this.onExpired);
    for (const streamingID of this.responseWatchers.keys()) {
      this.detachResponseWatchers(streamingID);
    }
  }

  private settle(
    pending: PendingResponse,
    settlement: Settlement,
    destroyDestination = true,
  ): boolean {
    if (this.activeClaims.get(pending.streamingID) !== pending) {
      return false;
    }

    this.activeClaims.delete(pending.streamingID);
    this.detachResponseWatchers(pending.streamingID);

    if (settlement.type === 'complete') {
      observeResponseSize({
        bytes: settlement.bodyBytes,
        isStreaming: true,
      });
    } else if (destroyDestination && !pending.destination.destroyed) {
      pending.destination.destroy(settlement.error);
    }
    return true;
  }

  private cancelFromDestination(streamingID: string, error: Error): void {
    const active = this.activeClaims.get(streamingID);
    if (active) {
      // The destination has already failed or closed. Release registry state;
      // pipeline owns propagation and destruction from this point.
      this.settle(active, { type: 'cancel', error }, false);
      return;
    }

    const registration =
      this.store.get<PendingResponseRegistration>(streamingID);
    if (registration) {
      this.store.del(streamingID);
    }
    this.detachResponseWatchers(streamingID);
    if (registration && !registration.response.destroyed) {
      registration.response.destroy();
    }
  }

  private detachResponseWatchers(streamingID: string): void {
    const watchers = this.responseWatchers.get(streamingID);
    if (!watchers) {
      return;
    }
    watchers.response.off('close', watchers.onClose);
    watchers.response.off('error', watchers.onError);
    this.responseWatchers.delete(streamingID);
  }
}

const isResponseUnavailable = (response: Response): boolean =>
  response.destroyed ||
  response.writableEnded ||
  response.writableFinished ||
  response.headersSent;

export const pendingResponseRegistry = new PendingResponseRegistry();
