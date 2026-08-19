import { Counter, Histogram, ValueType } from '@opentelemetry/api';
import { MeterProvider, MetricReader } from '@opentelemetry/sdk-metrics';
import { createMeterProvider, OtelConfig } from '../../common/metrics/otel';
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
 * @param config - Constructor options.
 */
export class OtelClient implements Client {
  private readonly meterProvider: MeterProvider;
  private readonly staleCredsSweepDurationHistogram: Histogram;
  private readonly staleCredsDisconnectedCounter: Counter;

  constructor(config: OtelClientConfig) {
    const otelConfig: OtelConfig & { otelEndpoint: URL } = {
      otelEndpoint: config.endpoint,
      otelExportIntervalMs: config.exportIntervalMs,
    };
    this.meterProvider = createMeterProvider(otelConfig, {
      reader: config.reader,
    });

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
    await this.meterProvider.shutdown();
  }
}
