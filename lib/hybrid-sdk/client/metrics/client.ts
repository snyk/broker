/** Backend-agnostic interface for emitting broker client metrics. */
export interface Client {
  /** Record a broker client initialization event. */
  incrementBrokerClientMetric(): void;
  /** Flush pending metrics and release resources. */
  shutdown(): Promise<void>;
  /** Force-flush pending metrics without shutting down. Used before process.exit(). */
  forceFlush(): Promise<void>;

  // ---- Group A: Process Health & Stability ----

  /**
   * Set the current state of a websocket connection.
   * Sets the active state to 1 and all other states to 0 on the
   * broker.client.connection.state gauge.
   */
  setConnectionState(
    state: 'connected' | 'reconnecting' | 'failed',
    role: string,
  ): void;

  /** Increment broker.client.reconnect.total on each retry attempt. */
  recordReconnect(): void;

  /**
   * Increment broker.client.process_exit.total before process.exit().
   * Best-effort — call forceFlush() if in an async context.
   */
  recordProcessExit(
    reason: 'reconnect_exhaustion' | 'auth_4xx' | 'uncaught_exception',
  ): void;

  /** Increment broker.client.auth_renewal_failure.total for non-2xx auth renewal responses. */
  recordAuthRenewalFailure(statusCode: number): void;

  /** Increment broker.client.uncaught_exception.total. */
  recordUncaughtException(errorCode: string): void;

  // ---- Group B: Request Flow & Downstream Observability ----

  /**
   * Increment broker.client.request.total.
   * flow: 'broker-server' = WS from server (filterRequest), 'local-client' = HTTP from local client (filterClientRequest).
   * allowed: whether the filter passed the request.
   */
  recordRequest(flow: 'broker-server' | 'local-client', allowed: boolean): void;

  /** Increment broker.client.downstream.request.total after a filter pass. */
  recordDownstreamRequest(streaming: boolean): void;

  /**
   * Record broker.client.downstream.duration.seconds.
   * Non-streaming: full round-trip. Streaming: time to response headers.
   */
  recordDownstreamDuration(streaming: boolean, durationSeconds: number): void;

  /**
   * Increment broker.client.downstream.status.
   * statusClass: '2xx' | '3xx' | '4xx' | '5xx'
   * Non-streaming only.
   */
  recordDownstreamStatus(statusClass: string): void;

  /**
   * Record broker.client.ws.duration.seconds on connection close.
   * durationSeconds: measured from connectionStartTime set in openHandler.
   */
  recordConnectionDuration(role: string, durationSeconds: number): void;

}
