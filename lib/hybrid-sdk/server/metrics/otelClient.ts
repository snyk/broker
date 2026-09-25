import { Counter, Histogram, ValueType } from '@opentelemetry/api';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { RuntimeNodeInstrumentation } from '@opentelemetry/instrumentation-runtime-node';
import { MeterProvider, MetricReader } from '@opentelemetry/sdk-metrics';
import {
  createMeterProvider,
  OtelConfig,
  RUNTIME_NODE_VIEWS,
} from '../../common/metrics/otel';
import { log as logger } from '../../../logs/logger';
import { Client } from './client';

/** Constructor options for OtelClient. */
export interface OtelClientConfig {
  /** OTLP/gRPC collector endpoint URL. */
  endpoint: URL;
  /** Periodic export interval in milliseconds. */
  exportIntervalMs: number;
  /** Optional metric reader (used for testing). */
  reader?: MetricReader;
}

/**
 * Client implementation backed by OpenTelemetry.
 * Exports metrics to an OTLP/gRPC endpoint using delta temporality.
 *
 * Automatically registers a selected subset of Node.js runtime metrics via
 * RuntimeNodeInstrumentation — event loop delay (max and p99), event loop
 * utilization, and GC duration — each renamed under the 'broker.' prefix for
 * pipeline compatibility. Other runtime metrics are filtered out.
 *
 * @param config - Constructor options.
 */
export class OtelClient implements Client {
  private readonly meterProvider: MeterProvider;
  private readonly runtimeInstrumentation?: RuntimeNodeInstrumentation;
  private readonly staleCredsSweepDurationHistogram: Histogram;
  private readonly staleCredsDisconnectedCounter: Counter;

  constructor(config: OtelClientConfig) {
    const otelConfig: OtelConfig & { otelEndpoint: URL } = {
      otelEndpoint: config.endpoint,
      otelExportIntervalMs: config.exportIntervalMs,
    };
    this.meterProvider = createMeterProvider(otelConfig, {
      reader: config.reader,
      views: RUNTIME_NODE_VIEWS,
    });

    // Guarded because a throw here propagates to index.ts, which exits the
    // process: RuntimeNodeInstrumentation reaches into perf_hooks and v8, so a
    // failure must cost the diagnostic metrics rather than the broker.
    try {
      this.runtimeInstrumentation = new RuntimeNodeInstrumentation();
      registerInstrumentations({
        meterProvider: this.meterProvider,
        instrumentations: [this.runtimeInstrumentation],
      });
    } catch (err) {
      logger.warn(
        { err },
        'Failed to register Node.js runtime instrumentation; runtime metrics will not be reported.',
      );
    }

    const meter = this.meterProvider.getMeter('broker-server');

    this.staleCredsSweepDurationHistogram = meter.createHistogram(
      'broker.server.stale_creds.sweep.duration.seconds',
      {
        description:
          'Duration of the stale-credentials connection watchdog sweep, in seconds.',
        unit: 's',
        advice: {
          explicitBucketBoundaries: [
            0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10, 30,
          ],
        },
      },
    );

    this.staleCredsDisconnectedCounter = meter.createCounter(
      'broker.server.stale_creds.disconnected.total',
      {
        description:
          'Count of connections disconnected by the stale-credentials watchdog sweep.',
        valueType: ValueType.INT,
      },
    );
  }

  observeStaleCredsSweepDuration(seconds: number): void {
    this.staleCredsSweepDurationHistogram.record(seconds);
  }

  incrementStaleCredsDisconnected(): void {
    this.staleCredsDisconnectedCounter.add(1);
  }

  async forceFlush(): Promise<void> {
    await this.meterProvider.forceFlush();
  }

  async shutdown(): Promise<void> {
    this.runtimeInstrumentation?.disable();
    await this.meterProvider.shutdown();
  }
}
