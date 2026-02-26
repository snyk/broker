/**
 * Raw string input for metrics configuration.
 * All values are optional strings; type coercion happens in {@link parse}.
 */
export interface RawConfig {
  metricsOtelEndpoint?: string;
  metricsOtelExportIntervalMs?: string;
}

/** Validated and typed metrics configuration. */
export interface Config {
  /** OTLP/gRPC endpoint for the metric exporter. Undefined when metrics are disabled. */
  otelEndpoint?: URL;
  /** How often (ms) the periodic metric reader exports collected metrics. */
  otelExportIntervalMs: number;
}

const DEFAULT_EXPORT_INTERVAL_MS = 10_000;

/**
 * Parse and validate raw string input into a typed {@link Config}.
 * Coerces the export interval to a number, falling back to 10 000 ms.
 */
export function parse(raw: RawConfig): Config {
  const rawEndpoint = raw.metricsOtelEndpoint;

  let otelEndpoint: URL | undefined;
  if (rawEndpoint) {
    try {
      otelEndpoint = new URL(rawEndpoint);
    } catch {
      throw new Error(
        `Invalid metricsOtelEndpoint: "${rawEndpoint}" is not a valid URL`,
      );
    }
  }

  const otelExportIntervalMs =
    Number(raw.metricsOtelExportIntervalMs) || DEFAULT_EXPORT_INTERVAL_MS;

  return { otelEndpoint, otelExportIntervalMs };
}
