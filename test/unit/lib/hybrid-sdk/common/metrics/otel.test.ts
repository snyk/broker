import { MetricReader } from '@opentelemetry/sdk-metrics';
import {
  createMeterProvider,
  parseOtelConfig,
} from '../../../../../../lib/hybrid-sdk/common/metrics/otel';

class TestMetricReader extends MetricReader {
  protected async onShutdown(): Promise<void> {}
  protected async onForceFlush(): Promise<void> {}
}

describe('common/metrics/otel', () => {
  describe('parseOtelConfig', () => {
    it('returns defaults when no raw config is provided', () => {
      const config = parseOtelConfig({});
      expect(config.otelEndpoint).toBeUndefined();
      expect(config.otelExportIntervalMs).toBe(10_000);
    });

    it('parses endpoint from metricsOtelEndpoint', () => {
      const config = parseOtelConfig({
        metricsOtelEndpoint: 'http://collector:4317',
      });
      expect(config.otelEndpoint).toEqual(new URL('http://collector:4317'));
    });

    it('coerces metricsOtelExportIntervalMs to a number', () => {
      const config = parseOtelConfig({
        metricsOtelExportIntervalMs: '30000',
      });
      expect(config.otelExportIntervalMs).toBe(30_000);
    });

    it('falls back to default when export interval is not a number', () => {
      const config = parseOtelConfig({
        metricsOtelExportIntervalMs: 'notanumber',
      });
      expect(config.otelExportIntervalMs).toBe(10_000);
    });

    it('falls back to default for an explicit export interval of 0 — export cannot be disabled this way', () => {
      const config = parseOtelConfig({
        metricsOtelExportIntervalMs: '0',
      });
      expect(config.otelExportIntervalMs).toBe(10_000);
    });

    it('falls back to default for a negative export interval', () => {
      const config = parseOtelConfig({
        metricsOtelExportIntervalMs: '-30000',
      });
      expect(config.otelExportIntervalMs).toBe(10_000);
    });

    it('treats empty endpoint as undefined', () => {
      const config = parseOtelConfig({ metricsOtelEndpoint: '' });
      expect(config.otelEndpoint).toBeUndefined();
    });

    it('throws on an invalid endpoint URL', () => {
      expect(() =>
        parseOtelConfig({ metricsOtelEndpoint: 'not a url' }),
      ).toThrow('Invalid metricsOtelEndpoint');
    });
  });

  describe('createMeterProvider', () => {
    it('builds a MeterProvider using the supplied reader', async () => {
      const reader = new TestMetricReader();
      const meterProvider = createMeterProvider(
        {
          otelEndpoint: new URL('http://localhost:4317'),
          otelExportIntervalMs: 60_000,
        },
        { reader },
      );

      const meter = meterProvider.getMeter('test-meter');
      const counter = meter.createCounter('test.counter');
      counter.add(1);

      const { resourceMetrics } = await reader.collect();
      const names = resourceMetrics.scopeMetrics
        .flatMap((sm) => sm.metrics)
        .map((m) => m.descriptor.name);
      expect(names).toContain('test.counter');

      await meterProvider.shutdown();
    });

    it('applies supplied views', async () => {
      const reader = new TestMetricReader();
      const meterProvider = createMeterProvider(
        {
          otelEndpoint: new URL('http://localhost:4317'),
          otelExportIntervalMs: 60_000,
        },
        {
          reader,
          views: [
            {
              instrumentName: 'renamed.me',
              meterName: 'test-meter',
              name: 'renamed.metric',
            },
          ],
        },
      );

      const meter = meterProvider.getMeter('test-meter');
      meter.createCounter('renamed.me').add(1);

      const { resourceMetrics } = await reader.collect();
      const names = resourceMetrics.scopeMetrics
        .flatMap((sm) => sm.metrics)
        .map((m) => m.descriptor.name);
      expect(names).toContain('renamed.metric');
      expect(names).not.toContain('renamed.me');

      await meterProvider.shutdown();
    });
  });
});
