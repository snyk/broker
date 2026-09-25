import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import {
  AggregationTemporality,
  AggregationType,
  MeterProvider,
  MetricReader,
  PeriodicExportingMetricReader,
  ViewOptions,
} from '@opentelemetry/sdk-metrics';
import { log as logger } from '../../../logs/logger';

/**
 * Raw string input for OTel metrics configuration.
 * All values are optional strings; type coercion happens in parseOtelConfig.
 */
export interface RawOtelConfig {
  metricsOtelEndpoint?: string;
  metricsOtelExportIntervalMs?: string;
}

/** Validated and typed OTel metrics configuration. */
export interface OtelConfig {
  /** OTLP/gRPC endpoint for the metric exporter. Undefined when metrics are disabled. */
  otelEndpoint?: URL;
  /** How often (ms) the periodic metric reader exports collected metrics. */
  otelExportIntervalMs: number;
}

const DEFAULT_EXPORT_INTERVAL_MS = 10_000;

/**
 * Parse and validate raw string input into a typed OTel metrics config.
 * Coerces the export interval to a number, falling back to the default for
 * any unset, non-numeric, zero, or negative value — export cannot be
 * disabled via this setting.
 *
 * @param raw - Raw string config values (e.g. from env vars).
 * @returns The validated, typed config.
 * @throws If metricsOtelEndpoint is set but not a valid URL.
 */
export function parseOtelConfig(raw: RawOtelConfig): OtelConfig {
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

  // Export cannot be disabled via the interval: zero, negative, and
  // non-numeric values all fall back to the default rather than being
  // honoured literally.
  const parsedIntervalMs = Number(raw.metricsOtelExportIntervalMs);
  const otelExportIntervalMs =
    Number.isFinite(parsedIntervalMs) && parsedIntervalMs > 0
      ? parsedIntervalMs
      : DEFAULT_EXPORT_INTERVAL_MS;

  return { otelEndpoint, otelExportIntervalMs };
}

const RUNTIME_NODE_METER_NAME = '@opentelemetry/instrumentation-runtime-node';

/**
 * Views applied by every mode that registers RuntimeNodeInstrumentation.
 * Shared so instrument names cannot drift between client and server mode and
 * silently split a dashboard.
 *
 * The renames are required because the metrics pipeline filters the upstream
 * `nodejs.*` and `v8js.*` namespaces out. Views match independently, so each
 * rename survives the trailing wildcard drop.
 *
 * Dropping happens at export, not at collection: the instrumentation runs
 * every collector regardless of these views.
 */
export const RUNTIME_NODE_VIEWS: ViewOptions[] = [
  {
    instrumentName: 'nodejs.eventloop.delay.max',
    meterName: RUNTIME_NODE_METER_NAME,
    name: 'broker.nodejs.eventloop.delay.max',
  },
  {
    instrumentName: 'nodejs.eventloop.delay.p99',
    meterName: RUNTIME_NODE_METER_NAME,
    name: 'broker.nodejs.eventloop.delay.p99',
  },
  {
    instrumentName: 'nodejs.eventloop.utilization',
    meterName: RUNTIME_NODE_METER_NAME,
    name: 'broker.nodejs.eventloop.utilization',
  },
  {
    instrumentName: 'v8js.gc.duration',
    meterName: RUNTIME_NODE_METER_NAME,
    name: 'broker.v8js.gc.duration',
  },
  // Drop all other runtime metrics. Infra automatically filter these runtime
  // metrics out due to the large volume emitted, so we want to be selective.
  {
    instrumentName: '*',
    meterName: RUNTIME_NODE_METER_NAME,
    aggregation: { type: AggregationType.DROP },
  },
];

/** Options for createMeterProvider. */
export interface CreateMeterProviderOpts {
  /** Views to apply to the meter provider (e.g. renaming or dropping instruments). */
  views?: ViewOptions[];
  /** Optional metric reader override (used for testing). */
  reader?: MetricReader;
}

/**
 * Build a MeterProvider exporting to an OTLP/gRPC endpoint using delta
 * temporality, on a periodic export interval.
 *
 * @param config - OTel config with a required endpoint.
 * @param opts - Optional views/reader overrides.
 * @returns A configured MeterProvider.
 */
export function createMeterProvider(
  config: OtelConfig & { otelEndpoint: URL },
  opts: CreateMeterProviderOpts = {},
): MeterProvider {
  const reader =
    opts.reader ??
    new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: config.otelEndpoint.toString(),
        temporalityPreference: AggregationTemporality.DELTA,
      }),
      exportIntervalMillis: config.otelExportIntervalMs,
    });

  return new MeterProvider({
    readers: [reader],
    views: opts.views ?? [],
  });
}

/** Constructor shape shared by the client- and server-side `OtelClient` implementations. */
export interface OtelClientCtor<T> {
  new (opts: { endpoint: URL; exportIntervalMs: number }): T;
}

/**
 * Shared factory behind the client- and server-side `metrics.createClient()`
 * entry points: parses raw config and returns a no-op client when no OTel
 * endpoint is configured, or an OTel-backed client otherwise.
 *
 * @param raw - Raw string config values (e.g. from env vars).
 * @param NoopCtor - Constructor for the no-op client, used when no OTel endpoint is configured.
 * @param OtelCtor - Constructor for the OTel-backed client, used when an endpoint is configured.
 * @returns An instance constructed by NoopCtor or OtelCtor.
 * @throws If parsing the config, or constructing the OTel-backed client, fails.
 */
export function createOtelBackedClient<T>(
  raw: RawOtelConfig,
  NoopCtor: new () => T,
  OtelCtor: OtelClientCtor<T>,
): T {
  let config: OtelConfig;
  try {
    config = parseOtelConfig(raw);
  } catch (cause) {
    throw new Error('failed to parse metrics config', { cause });
  }

  if (!config.otelEndpoint) {
    logger.info('OTel metrics endpoint not configured, using noop metrics.');
    return new NoopCtor();
  }

  logger.info(
    {
      endpoint: config.otelEndpoint.toString(),
      exportIntervalMs: config.otelExportIntervalMs,
    },
    'Initializing OTel metrics client.',
  );

  try {
    return new OtelCtor({
      endpoint: config.otelEndpoint,
      exportIntervalMs: config.otelExportIntervalMs,
    });
  } catch (cause) {
    throw new Error('failed to create OTel metrics client', { cause });
  }
}
