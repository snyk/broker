import { NoopClient } from '../../../../lib/hybrid-sdk/client/metrics/noopClient';
import { OtelClient } from '../../../../lib/hybrid-sdk/client/metrics/otelClient';
import { Client } from '../../../../lib/hybrid-sdk/client/metrics/client';
import { DataPointType, MetricReader } from '@opentelemetry/sdk-metrics';

class TestMetricReader extends MetricReader {
  protected async onShutdown(): Promise<void> {}
  protected async onForceFlush(): Promise<void> {}
}

describe('metrics client recordConnectionTeardown', () => {
  it('NoopClient exposes recordConnectionTeardown and does not throw', () => {
    const client: Client = new NoopClient();
    expect(() =>
      client.recordConnectionTeardown('auth_renewal_exhaustion'),
    ).not.toThrow();
  });

  describe('OtelClient.recordConnectionTeardown', () => {
    let reader: TestMetricReader;
    let client: OtelClient;

    beforeEach(() => {
      reader = new TestMetricReader();
      client = new OtelClient({
        endpoint: new URL('http://localhost:4317'),
        exportIntervalMs: 60_000,
        reader,
      });
    });

    afterEach(async () => {
      await client.shutdown();
    });

    it('increments broker.client.connection_teardown.total with the given reason', async () => {
      client.recordConnectionTeardown('auth_renewal_exhaustion');

      const { resourceMetrics } = await reader.collect();
      const metric = resourceMetrics.scopeMetrics
        .flatMap((sm) => sm.metrics)
        .find(
          (m) =>
            m.descriptor.name === 'broker.client.connection_teardown.total',
        );

      expect(metric).toBeDefined();
      expect(metric!.dataPointType).toBe(DataPointType.SUM);
      const dataPoints = metric!.dataPoints as any[];
      expect(dataPoints[0].value).toBe(1);
      expect(dataPoints[0].attributes['reason']).toBe(
        'auth_renewal_exhaustion',
      );
    });

    it('labels the teardown metric with friendly_name when provided', async () => {
      client.recordConnectionTeardown('auth_renewal_exhaustion', 'conn-A');

      const { resourceMetrics } = await reader.collect();
      const metric = resourceMetrics.scopeMetrics
        .flatMap((sm) => sm.metrics)
        .find(
          (m) =>
            m.descriptor.name === 'broker.client.connection_teardown.total',
        );

      const dataPoints = metric!.dataPoints as any[];
      expect(dataPoints[0].attributes['friendly_name']).toBe('conn-A');
    });

    it('records connection_reestablishment.total by outcome and friendly_name', async () => {
      client.recordConnectionReestablishment('attempt', 'conn-A');
      client.recordConnectionReestablishment('exhausted', 'conn-A');

      const { resourceMetrics } = await reader.collect();
      const metric = resourceMetrics.scopeMetrics
        .flatMap((sm) => sm.metrics)
        .find(
          (m) =>
            m.descriptor.name ===
            'broker.client.connection_reestablishment.total',
        );

      expect(metric).toBeDefined();
      const dataPoints = metric!.dataPoints as any[];
      const outcomes = dataPoints.map((dp) => dp.attributes['outcome']).sort();
      expect(outcomes).toEqual(['attempt', 'exhausted']);
      expect(
        dataPoints.every((dp) => dp.attributes['friendly_name'] === 'conn-A'),
      ).toBe(true);
    });
  });
});
