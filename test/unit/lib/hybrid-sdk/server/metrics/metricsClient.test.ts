import { DataPointType, MetricReader } from '@opentelemetry/sdk-metrics';
import * as metrics from '../../../../../../lib/hybrid-sdk/server/metrics';

class TestMetricReader extends MetricReader {
  protected async onShutdown(): Promise<void> {}
  protected async onForceFlush(): Promise<void> {}
}

describe('server/metrics', () => {
  describe('createClient', () => {
    it('returns NoopClient when no endpoint is configured', () => {
      const client = metrics.createClient({});
      expect(client).toBeInstanceOf(metrics.NoopClient);
    });

    it('returns OtelClient when an endpoint is set', async () => {
      const client = metrics.createClient({
        metricsOtelEndpoint: 'http://localhost:4317',
      });
      expect(client).toBeInstanceOf(metrics.OtelClient);
      await client.shutdown();
    });
  });

  describe('OtelClient', () => {
    let reader: TestMetricReader;
    let client: metrics.OtelClient;

    beforeEach(() => {
      reader = new TestMetricReader();
      client = new metrics.OtelClient({
        endpoint: new URL('http://localhost:4317'),
        exportIntervalMs: 60_000,
        reader,
      });
    });

    // RuntimeNodeInstrumentation starts its collectors in the constructor, so
    // disabling it on shutdown is what keeps the shared jest process clean.
    afterEach(async () => {
      await client.shutdown();
    });

    async function collectMetrics() {
      const { resourceMetrics } = await reader.collect();
      return resourceMetrics.scopeMetrics.flatMap((sm) => sm.metrics);
    }

    async function collectMetricNames() {
      return (await collectMetrics()).map((m) => m.descriptor.name);
    }

    // The event loop delay histogram needs at least one sampling interval of data
    // before its observable callback reports anything.
    async function awaitFirstRuntimeSample() {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // GC duration is omitted: it only reports once a collection has actually
    // run. Its view is pinned in common/metrics/otel.test.ts instead.
    it.each([
      'broker.nodejs.eventloop.delay.max',
      'broker.nodejs.eventloop.delay.p99',
      'broker.nodejs.eventloop.utilization',
    ])('rename view produces %s', async (name) => {
      await awaitFirstRuntimeSample();

      expect(await collectMetricNames()).toContain(name);
    });

    it('drop view leaves no runtime metrics in collected output', async () => {
      await awaitFirstRuntimeSample();

      const names = await collectMetricNames();

      // Two prefixes: event loop collectors emit under `nodejs.`, GC and heap
      // collectors under `v8js.`.
      expect(
        names.filter((n) => n.startsWith('nodejs.') || n.startsWith('v8js.')),
      ).toHaveLength(0);
      // Also pinned by name, so a dependency bump that moves an instrument out
      // of either prefix fails here rather than widening what we export.
      expect(names).not.toContain('nodejs.eventloop.delay.p50');
      expect(names).not.toContain('nodejs.eventloop.time');
      expect(names).not.toContain('v8js.memory.heap.used');
    });

    it('custom instruments survive the runtime wildcard drop view', async () => {
      client.observeStaleCredsSweepDuration(0.25);
      client.incrementStaleCredsDisconnected();

      const collected = await collectMetrics();
      const sweep = collected.find(
        (m) =>
          m.descriptor.name ===
          'broker.server.stale_creds.sweep.duration.seconds',
      );
      const disconnected = collected.find(
        (m) =>
          m.descriptor.name === 'broker.server.stale_creds.disconnected.total',
      );

      expect(sweep).toBeDefined();
      expect(sweep!.dataPointType).toBe(DataPointType.HISTOGRAM);
      expect(disconnected).toBeDefined();
      expect(disconnected!.dataPointType).toBe(DataPointType.SUM);
      expect(disconnected!.dataPoints[0].value).toBe(1);
    });

    it('shutdown resolves cleanly', async () => {
      await expect(client.shutdown()).resolves.toBeUndefined();
    });

    it('forceFlush resolves cleanly', async () => {
      await expect(client.forceFlush()).resolves.toBeUndefined();
    });
  });
});
