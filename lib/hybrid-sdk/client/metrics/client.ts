/** Backend-agnostic interface for emitting broker client metrics. */
export interface Client {
  /** Record a broker client initialization event. */
  incrementBrokerClientMetric(): void;
  /** Flush pending metrics and release resources. */
  shutdown(): Promise<void>;
}
