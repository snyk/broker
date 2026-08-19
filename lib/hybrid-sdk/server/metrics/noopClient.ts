import { Client } from './client';

/**
 * Client implementation that does nothing.
 * Used when no metrics endpoint is configured.
 */
export class NoopClient implements Client {
  observeStaleCredsSweepDuration(): void {}
  incrementStaleCredsDisconnected(): void {}
  async forceFlush(): Promise<void> {}
  async shutdown(): Promise<void> {}
}
