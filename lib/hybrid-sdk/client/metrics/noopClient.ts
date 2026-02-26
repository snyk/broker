import { Client } from './client';

/**
 * {@link Client} that does nothing.
 * Used when no metrics endpoint is configured.
 */
export class NoopClient implements Client {
  incrementBrokerClientMetric(): void {
    // no-op
  }

  async shutdown(): Promise<void> {
    // no-op
  }
}
