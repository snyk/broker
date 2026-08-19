/** Backend-agnostic interface for emitting broker server metrics. */
export interface Client {
  /** Record broker.server.stale_creds.sweep.duration.seconds for a watchdog sweep. */
  observeStaleCredsSweepDuration(seconds: number): void;

  /** Increment broker.server.stale_creds.disconnected.total for each stale connection closed. */
  incrementStaleCredsDisconnected(): void;

  /** Force-flush pending metrics without shutting down. */
  forceFlush(): Promise<void>;

  /** Flush pending metrics and release resources. */
  shutdown(): Promise<void>;
}
