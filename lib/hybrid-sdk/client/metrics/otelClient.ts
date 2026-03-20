import { Counter, ValueType } from '@opentelemetry/api';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { RuntimeNodeInstrumentation } from '@opentelemetry/instrumentation-runtime-node';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import {
  AggregationTemporality,
  MeterProvider,
  MetricReader,
  PeriodicExportingMetricReader,
  AggregationType,
} from '@opentelemetry/sdk-metrics';
import { Client } from './client';

/** Constructor options for {@link OtelClient}. */
export interface OtelClientConfig {
  /** OTLP/gRPC collector endpoint URL. */
  endpoint: URL;
  /** Periodic export interval in milliseconds. */
  exportIntervalMs: number;
  /** Optional metric reader (used for testing). */
  reader?: MetricReader;
}

/**
 * {@link Client} implementation backed by OpenTelemetry.
 * Exports metrics to an OTLP/gRPC endpoint using delta temporality.
 *
 * Automatically registers the Node.js event loop delay p99 metric via
 * {@link RuntimeNodeInstrumentation}, renamed to 'broker.nodejs.eventloop.delay.p99'
 * for pipeline compatibility. Other runtime metrics are filtered out.
 *
 * For non-Kubernetes environments, container metrics (CPU, memory, network I/O)
 * are already provided by the infrastructure via cAdvisor.
 */
export class OtelClient implements Client {
  private readonly meterProvider: MeterProvider;
  private readonly runtimeInstrumentation: RuntimeNodeInstrumentation;
  private readonly brokerClientInitializedCounter: Counter;

  constructor(config: OtelClientConfig) {
    const reader =
      config.reader ??
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: config.endpoint.toString(),
          temporalityPreference: AggregationTemporality.DELTA,
        }),
        exportIntervalMillis: config.exportIntervalMs,
      });

    this.meterProvider = new MeterProvider({
      readers: [reader],
      views: [
        // Rename p99 event loop delay metric with `broker.` prefix to avoid being filtered out
        // by the metrics pipeline.
        {
          instrumentName: 'nodejs.eventloop.delay.p99',
          meterName: '@opentelemetry/instrumentation-runtime-node',
          name: 'broker.nodejs.eventloop.delay.p99',
        },
        // Drop all other NodeJS runtime metrics. Infra automatically filter these runtime
        // metrics out due to the large volume emitted, so we want to be selective.
        {
          instrumentName: '*',
          meterName: '@opentelemetry/instrumentation-runtime-node',
          aggregation: { type: AggregationType.DROP },
        },
      ],
    });

    this.runtimeInstrumentation = new RuntimeNodeInstrumentation();
    registerInstrumentations({
      meterProvider: this.meterProvider,
      instrumentations: [this.runtimeInstrumentation],
    });

    const meter = this.meterProvider.getMeter('broker-client');

    this.brokerClientInitializedCounter = meter.createCounter(
      'broker.client.initialized',
      {
        description: 'Count of broker client initializations',
        valueType: ValueType.INT,
      },
    );
  }

  incrementBrokerClientMetric(): void {
    this.brokerClientInitializedCounter.add(1);
  }

  async shutdown(): Promise<void> {
    this.runtimeInstrumentation.disable();
    await this.meterProvider.shutdown();
  }
}
