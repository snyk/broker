import { Client } from './client';

/**
 * {@link Client} that does nothing.
 * Used when no metrics endpoint is configured.
 */
export class NoopClient implements Client {
  incrementBrokerClientMetric(): void {}
  async shutdown(): Promise<void> {}
  async forceFlush(): Promise<void> {}

  setConnectionState(
    _state: 'connected' | 'reconnecting' | 'failed',
    _role: string,
  ): void {}
  recordReconnect(): void {}
  recordProcessExit(
    _reason: 'reconnect_exhaustion' | 'auth_4xx' | 'uncaught_exception',
  ): void {}
  recordAuthRenewalFailure(_statusCode: number): void {}
  recordUncaughtException(_errorCode: string): void {}

  recordRequest(_flow: 'broker-server' | 'local-client', _allowed: boolean): void {}
  recordDownstreamRequest(_streaming: boolean): void {}
  recordDownstreamDuration(
    _streaming: boolean,
    _durationSeconds: number,
  ): void {}
  recordDownstreamStatus(_statusClass: string): void {}
  recordConnectionDuration(_role: string, _durationSeconds: number): void {}
  recordUpstreamResponseBytes(_bytes: number): void {}
  incrementInflight(): void {}
  decrementInflight(): void {}
  recordPingLatency(_durationSeconds: number): void {}
}
