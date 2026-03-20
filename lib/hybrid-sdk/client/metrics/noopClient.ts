import { Client } from './client';

/**
 * {@link Client} that does nothing.
 * Used when no metrics endpoint is configured.
 */
export class NoopClient implements Client {
  incrementBrokerClientMetric(): void {}
  async shutdown(): Promise<void> {}
  async forceFlush(): Promise<void> {}

  setConnectionState(): void {}
  recordReconnect(): void {}
  recordProcessExit(): void {}
  recordAuthRenewalFailure(): void {}
  recordUncaughtException(): void {}

  recordRequest(): void {}
  recordDownstreamRequest(): void {}
  recordDownstreamDuration(): void {}
  recordDownstreamStatus(): void {}
  recordConnectionDuration(): void {}
  recordUpstreamResponseBytes(): void {}
  incrementInflight(): void {}
  decrementInflight(): void {}
  recordPingLatency(): void {}
}
