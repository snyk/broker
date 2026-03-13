import {
  Counter,
  Gauge,
  Histogram,
  UpDownCounter,
  ValueType,
} from '@opentelemetry/api';
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

const CONNECTION_STATES = ['connected', 'reconnecting', 'failed'] as const;

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

  // Process Health
  private readonly brokerClientInitializedCounter: Counter;
  private readonly connectionStateGauge: Gauge;
  private readonly reconnectCounter: Counter;
  private readonly processExitCounter: Counter;
  private readonly authRenewalFailureCounter: Counter;
  private readonly uncaughtExceptionCounter: Counter;

  // Request Flow
  private readonly requestCounter: Counter;
  private readonly downstreamRequestCounter: Counter;
  private readonly downstreamDurationHistogram: Histogram;
  private readonly downstreamStatusCounter: Counter;
  private readonly connectionDurationHistogram: Histogram;
  private readonly upstreamResponseBytesHistogram: Histogram;
  private readonly inflightRequestsCounter: UpDownCounter;
  private readonly pingLatencyHistogram: Histogram;

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

    // --- Process Health ---

    this.brokerClientInitializedCounter = meter.createCounter(
      'broker.client.initialized',
      {
        description: 'Count of broker client initializations',
        valueType: ValueType.INT,
      },
    );

    this.connectionStateGauge = meter.createGauge(
      'broker.client.connection.state',
      {
        description:
          'Current state of each websocket connection (1 = active state, 0 = inactive). Attributes: state (connected|reconnecting|failed), role (primary|secondary).',
        valueType: ValueType.INT,
      },
    );

    this.reconnectCounter = meter.createCounter('broker.client.reconnect.total', {
      description: 'Number of websocket reconnect attempts scheduled',
      valueType: ValueType.INT,
    });

    this.processExitCounter = meter.createCounter(
      'broker.client.process_exit.total',
      {
        description:
          'Count of process exits by reason (reconnect_exhaustion, auth_4xx, uncaught_exception).',
        valueType: ValueType.INT,
      },
    );

    this.authRenewalFailureCounter = meter.createCounter(
      'broker.client.auth_renewal_failure.total',
      {
        description:
          'Auth renewal HTTP failures by status code.',
        valueType: ValueType.INT,
      },
    );

    this.uncaughtExceptionCounter = meter.createCounter(
      'broker.client.uncaught_exception.total',
      {
        description: 'Uncaught exceptions by error code (ECONNRESET, ETIMEDOUT, etc.)',
        valueType: ValueType.INT,
      },
    );

    // Uptime: ObservableGauge backed by process.uptime()
    meter
      .createObservableGauge('broker.client.uptime_seconds', {
        description:
          'Seconds since the broker client process started. Short uptimes signal restart loops.',
        unit: 's',
      })
      .addCallback((result) => {
        result.observe(process.uptime());
      });

    // --- Request Flow ---

    this.requestCounter = meter.createCounter('broker.client.request.total', {
      description:
        'Total requests received, tagged by filter flow (broker-server=WS from server, local-client=HTTP from local client) and filter outcome',
      valueType: ValueType.INT,
    });

    this.downstreamRequestCounter = meter.createCounter(
      'broker.client.downstream.request.total',
      {
        description: 'Requests forwarded to downstream after passing filter rules',
        valueType: ValueType.INT,
      },
    );

    this.downstreamDurationHistogram = meter.createHistogram(
      'broker.client.downstream.duration.seconds',
      {
        description:
          'Duration of downstream HTTP calls in seconds. Non-streaming: full round-trip. Streaming: time to response headers.',
        unit: 's',
        advice: {
          explicitBucketBoundaries: [
            0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30,
          ],
        },
      },
    );

    this.downstreamStatusCounter = meter.createCounter(
      'broker.client.downstream.status',
      {
        description:
          'Downstream response status class distribution (non-streaming only)',
        valueType: ValueType.INT,
      },
    );

    this.connectionDurationHistogram = meter.createHistogram(
      'broker.client.ws.duration.seconds',
      {
        description:
          'Websocket connection duration from open to close, in seconds',
        unit: 's',
        advice: {
          explicitBucketBoundaries: [
            1, 5, 10, 15, 30, 60, 300, 900, 3600, 14400, 43200, 86400,
          ],
        },
      },
    );

    this.upstreamResponseBytesHistogram = meter.createHistogram(
      'broker.client.upstream.response.bytes',
      {
        description:
          'Byte size of response bodies sent back to the broker server',
        unit: 'By',
        advice: {
          explicitBucketBoundaries: [
            1024, 10240, 102400, 524288, 1048576, 5242880, 10485760, 20971520,
          ],
        },
      },
    );

    this.inflightRequestsCounter = meter.createUpDownCounter(
      'broker.client.inflight.requests',
      {
        description:
          'Number of downstream requests currently in progress',
        valueType: ValueType.INT,
      },
    );

    // TODO: These buckets might not make sense
    this.pingLatencyHistogram = meter.createHistogram(
      'broker.client.ws.ping.latency.seconds',
      {
        description:
          'Websocket heartbeat (ping/pong) round-trip latency in seconds',
        unit: 's',
        advice: {
          explicitBucketBoundaries: [
            0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
          ],
        },
      },
    );
  }

  // --- Existing ---

  incrementBrokerClientMetric(): void {
    this.brokerClientInitializedCounter.add(1);
  }

  async forceFlush(): Promise<void> {
    await this.meterProvider.forceFlush();
  }

  async shutdown(): Promise<void> {
    this.runtimeInstrumentation.disable();
    await this.meterProvider.shutdown();
  }

  // --- Process Health ---

  /**
   * Set the connection state gauge for a given role.
   * Sets the active state attribute to 1 and all other state attributes to 0.
   */
  setConnectionState(
    state: 'connected' | 'reconnecting' | 'failed',
    role: string,
  ): void {
    for (const s of CONNECTION_STATES) {
      this.connectionStateGauge.record(s === state ? 1 : 0, {
        state: s,
        role,
      });
    }
  }

  recordReconnect(): void {
    this.reconnectCounter.add(1);
  }

  recordProcessExit(
    reason: 'reconnect_exhaustion' | 'auth_4xx' | 'uncaught_exception',
  ): void {
    this.processExitCounter.add(1, { reason });
  }

  recordAuthRenewalFailure(statusCode: number): void {
    this.authRenewalFailureCounter.add(1, {
      status_code: String(statusCode),
    });
  }

  recordUncaughtException(errorCode: string): void {
    this.uncaughtExceptionCounter.add(1, { error_code: errorCode });
  }

  // --- Request Flow ---

  recordRequest(flow: 'broker-server' | 'local-client', allowed: boolean): void {
    this.requestCounter.add(1, { flow, allowed: String(allowed) });
  }

  recordDownstreamRequest(streaming: boolean): void {
    this.downstreamRequestCounter.add(1, { streaming: String(streaming) });
  }

  recordDownstreamDuration(streaming: boolean, durationSeconds: number): void {
    this.downstreamDurationHistogram.record(durationSeconds, {
      streaming: String(streaming),
    });
  }

  recordDownstreamStatus(statusClass: string): void {
    this.downstreamStatusCounter.add(1, { status_class: statusClass });
  }

  recordConnectionDuration(role: string, durationSeconds: number): void {
    this.connectionDurationHistogram.record(durationSeconds, { role });
  }

  recordUpstreamResponseBytes(bytes: number): void {
    this.upstreamResponseBytesHistogram.record(bytes);
  }

  incrementInflight(): void {
    this.inflightRequestsCounter.add(1);
  }

  decrementInflight(): void {
    this.inflightRequestsCounter.add(-1);
  }

  recordPingLatency(durationSeconds: number): void {
    this.pingLatencyHistogram.record(durationSeconds);
  }
}
