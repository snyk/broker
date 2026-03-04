import * as metrics from '../../../../lib/hybrid-sdk/client/metrics';
import { parse } from '../../../../lib/hybrid-sdk/client/metrics/config';
import {
  DataPointType,
  MeterProvider,
  MetricReader,
} from '@opentelemetry/sdk-metrics';

class TestMetricReader extends MetricReader {
  protected async onShutdown(): Promise<void> {}
  protected async onForceFlush(): Promise<void> {}
}

describe('client/metrics', () => {
  describe('parse', () => {
    it('returns defaults when no raw config is provided', () => {
      const config = parse({});
      expect(config.otelEndpoint).toBeUndefined();
      expect(config.otelExportIntervalMs).toBe(10_000);
    });

    it('parses endpoint from metricsOtelEndpoint', () => {
      const config = parse({
        metricsOtelEndpoint: 'http://collector:4317',
      });
      expect(config.otelEndpoint).toEqual(new URL('http://collector:4317'));
    });

    it('coerces metricsOtelExportIntervalMs to a number', () => {
      const config = parse({
        metricsOtelExportIntervalMs: '30000',
      });
      expect(config.otelExportIntervalMs).toBe(30_000);
    });

    it('falls back to default when export interval is not a number', () => {
      const config = parse({
        metricsOtelExportIntervalMs: 'notanumber',
      });
      expect(config.otelExportIntervalMs).toBe(10_000);
    });

    it('treats empty endpoint as undefined', () => {
      const config = parse({ metricsOtelEndpoint: '' });
      expect(config.otelEndpoint).toBeUndefined();
    });

    it('throws on an invalid endpoint URL', () => {
      expect(() => parse({ metricsOtelEndpoint: 'not a url' })).toThrow(
        'Invalid metricsOtelEndpoint',
      );
    });

    it('accepts a valid http endpoint', () => {
      const config = parse({
        metricsOtelEndpoint: 'http://localhost:4317',
      });
      expect(config.otelEndpoint).toEqual(new URL('http://localhost:4317'));
    });

    it('accepts a valid https endpoint', () => {
      const config = parse({
        metricsOtelEndpoint: 'https://collector.example.com:4317',
      });
      expect(config.otelEndpoint).toEqual(
        new URL('https://collector.example.com:4317'),
      );
    });
  });

  describe('createMetricsClient', () => {
    it('returns NoopMetricsClient when no endpoint is configured', () => {
      const client = metrics.createClient({});
      expect(client).toBeInstanceOf(metrics.NoopClient);
    });

    it('returns OtelMetricsClient when endpoint is set', async () => {
      const client = metrics.createClient({
        metricsOtelEndpoint: 'http://localhost:4317',
      });
      expect(client).toBeInstanceOf(metrics.OtelClient);
      await client.shutdown();
    });

    it('wraps parse errors with context', () => {
      let thrown: Error | undefined;
      try {
        metrics.createClient({ metricsOtelEndpoint: 'not a url' });
      } catch (err) {
        thrown = err as Error;
      }

      expect(thrown).toBeInstanceOf(Error);
      expect(thrown!.message).toBe('failed to parse metrics config');
      expect(thrown!.cause).toBeInstanceOf(Error);
      expect((thrown!.cause as Error).message).toContain(
        'Invalid metricsOtelEndpoint',
      );
    });

    it('wraps OtelClient constructor errors with context', () => {
      jest.resetModules();
      jest.doMock(
        '../../../../lib/hybrid-sdk/client/metrics/otelClient',
        () => ({
          OtelClient: class {
            constructor() {
              throw new Error('gRPC init failed');
            }
          },
        }),
      );

      const freshMetrics = jest.requireActual<typeof metrics>(
        '../../../../lib/hybrid-sdk/client/metrics',
      );

      let thrown: Error | undefined;
      try {
        freshMetrics.createClient({
          metricsOtelEndpoint: 'http://localhost:4317',
        });
      } catch (err) {
        thrown = err as Error;
      }

      expect(thrown).toBeInstanceOf(Error);
      expect(thrown!.message).toBe('failed to create OTel metrics client');
      expect(thrown!.cause).toBeInstanceOf(Error);
      expect((thrown!.cause as Error).message).toBe('gRPC init failed');
    });
  });

  describe('NoopMetricsClient', () => {
    it('does not throw when incrementBrokerClientMetric is called', () => {
      const client = new metrics.NoopClient();
      expect(() => client.incrementBrokerClientMetric()).not.toThrow();
    });

    it('shutdown resolves cleanly', async () => {
      const client = new metrics.NoopClient();
      await expect(client.shutdown()).resolves.toBeUndefined();
    });
  });

  describe('OtelMetricsClient', () => {
    it('records a metric when incrementBrokerClientMetric is called', async () => {
      const reader = new TestMetricReader();
      const meterProvider = new MeterProvider({ readers: [reader] });

      const client = new metrics.OtelClient({
        endpoint: new URL('http://localhost:4317'),
        exportIntervalMs: 60_000,
        meterProvider,
      });

      client.incrementBrokerClientMetric();

      const { resourceMetrics } = await reader.collect();
      const metric = resourceMetrics.scopeMetrics
        .flatMap((sm) => sm.metrics)
        .find((m) => m.descriptor.name === 'broker.client.initialized');

      expect(metric).toBeDefined();
      expect(metric!.dataPointType).toBe(DataPointType.SUM);
      expect(metric!.dataPoints).toHaveLength(1);
      expect(metric!.dataPoints[0].value).toBe(1);

      await client.shutdown();
    });

    it('collects Node.js runtime metrics', async () => {
      const reader = new TestMetricReader();
      const meterProvider = new MeterProvider({ readers: [reader] });

      const client = new metrics.OtelClient({
        endpoint: new URL('http://localhost:4317'),
        exportIntervalMs: 60_000,
        meterProvider,
      });

      const { resourceMetrics } = await reader.collect();
      const allNames = resourceMetrics.scopeMetrics
        .flatMap((sm) => sm.metrics)
        .map((m) => m.descriptor.name);

      expect(allNames.some((name) => name.startsWith('nodejs.'))).toBe(true);

      await client.shutdown();
    });

    it('shutdown resolves cleanly with runtime instrumentation', async () => {
      const reader = new TestMetricReader();
      const meterProvider = new MeterProvider({ readers: [reader] });

      const client = new metrics.OtelClient({
        endpoint: new URL('http://localhost:4317'),
        exportIntervalMs: 60_000,
        meterProvider,
      });

      await expect(client.shutdown()).resolves.toBeUndefined();
    });
  });
});
