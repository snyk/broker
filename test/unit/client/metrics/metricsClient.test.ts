import * as metrics from '../../../../lib/hybrid-sdk/client/metrics';
import { parse } from '../../../../lib/hybrid-sdk/client/metrics/config';
import { DataPointType, MetricReader } from '@opentelemetry/sdk-metrics';

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

    it('forceFlush resolves cleanly', async () => {
      const client = new metrics.NoopClient();
      await expect(client.forceFlush()).resolves.toBeUndefined();
    });

    const noopMethods: Array<[string, Parameters<any>]> = [
      ['setConnectionState', ['connected', 'primary']],
      ['recordReconnect', []],
      ['recordProcessExit', ['reconnect_exhaustion']],
      ['recordAuthRenewalFailure', [503]],
      ['recordUncaughtException', ['ECONNRESET']],
      ['recordRequest', ['broker-server', true]],
      ['recordDownstreamRequest', [false]],
      ['recordDownstreamDuration', [false, 1.23]],
      ['recordDownstreamStatus', ['2xx']],
      ['recordConnectionDuration', ['primary', 300]],
      ['recordUpstreamResponseBytes', [1024]],
      ['incrementInflight', []],
      ['decrementInflight', []],
      ['recordPingLatency', [0.05]],
    ];

    it.each(noopMethods)('%s does not throw', (method, args) => {
      const client = new metrics.NoopClient();
      expect(() => (client as any)[method](...args)).not.toThrow();
    });
  });

  describe('OtelMetricsClient', () => {
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

    afterEach(async () => {
      await client.shutdown();
    });

    async function collectMetrics() {
      const { resourceMetrics } = await reader.collect();
      return resourceMetrics.scopeMetrics.flatMap((sm) => sm.metrics);
    }

    async function findMetric(name: string) {
      const all = await collectMetrics();
      const metric = all.find((m) => m.descriptor.name === name);
      if (!metric) return undefined;
      // Cast dataPoints to any[] so tests can call .find() without union-type issues
      return {
        ...metric,
        dataPoints: metric.dataPoints as any[],
      };
    }

    it('records broker.client.initialized', async () => {
      client.incrementBrokerClientMetric();
      const metric = await findMetric('broker.client.initialized');
      expect(metric).toBeDefined();
      expect(metric!.dataPointType).toBe(DataPointType.SUM);
      expect(metric!.dataPoints[0].value).toBe(1);
    });

    it('records broker.client.connection.state with correct state/role attributes', async () => {
      client.setConnectionState('connected', 'primary');
      const metric = await findMetric('broker.client.connection.state');
      expect(metric).toBeDefined();

      const dataPoints = metric!.dataPoints;
      const connectedPoint = dataPoints.find(
        (dp) =>
          dp.attributes['state'] === 'connected' &&
          dp.attributes['role'] === 'primary',
      );
      const reconnectingPoint = dataPoints.find(
        (dp) => dp.attributes['state'] === 'reconnecting',
      );
      const failedPoint = dataPoints.find(
        (dp) => dp.attributes['state'] === 'failed',
      );

      expect(connectedPoint?.value).toBe(1);
      expect(reconnectingPoint?.value).toBe(0);
      expect(failedPoint?.value).toBe(0);
    });

    it('zeroes previous state when transitioning', async () => {
      client.setConnectionState('connected', 'primary');
      client.setConnectionState('reconnecting', 'primary');

      const metric = await findMetric('broker.client.connection.state');
      const dataPoints = metric!.dataPoints;

      const connectedPoint = dataPoints.find(
        (dp) =>
          dp.attributes['state'] === 'connected' &&
          dp.attributes['role'] === 'primary',
      );
      const reconnectingPoint = dataPoints.find(
        (dp) =>
          dp.attributes['state'] === 'reconnecting' &&
          dp.attributes['role'] === 'primary',
      );

      expect(connectedPoint?.value).toBe(0);
      expect(reconnectingPoint?.value).toBe(1);
    });

    it('tracks state per role independently', async () => {
      client.setConnectionState('connected', 'primary');
      client.setConnectionState('reconnecting', 'secondary');

      const metric = await findMetric('broker.client.connection.state');
      const dataPoints = metric!.dataPoints;

      expect(
        dataPoints.find(
          (dp) =>
            dp.attributes['state'] === 'connected' &&
            dp.attributes['role'] === 'primary',
        )?.value,
      ).toBe(1);
      expect(
        dataPoints.find(
          (dp) =>
            dp.attributes['state'] === 'reconnecting' &&
            dp.attributes['role'] === 'secondary',
        )?.value,
      ).toBe(1);
    });

    it('records broker.client.reconnect.total', async () => {
      client.recordReconnect();
      client.recordReconnect();
      const metric = await findMetric('broker.client.reconnect.total');
      expect(metric!.dataPoints[0].value).toBe(2);
    });

    it('records broker.client.process_exit.total with reason attribute', async () => {
      client.recordProcessExit('reconnect_exhaustion');
      const metric = await findMetric('broker.client.process_exit.total');
      expect(metric!.dataPoints[0].value).toBe(1);
      expect(metric!.dataPoints[0].attributes['reason']).toBe(
        'reconnect_exhaustion',
      );
    });

    it('records broker.client.auth_renewal_failure.total with status_code', async () => {
      client.recordAuthRenewalFailure(503);
      const metric = await findMetric(
        'broker.client.auth_renewal_failure.total',
      );
      expect(metric!.dataPoints[0].value).toBe(1);
      expect(metric!.dataPoints[0].attributes['status_code']).toBe('503');
    });

    it('records broker.client.uncaught_exception.total with error_code', async () => {
      client.recordUncaughtException('ECONNRESET');
      const metric = await findMetric('broker.client.uncaught_exception.total');
      expect(metric!.dataPoints[0].value).toBe(1);
      expect(metric!.dataPoints[0].attributes['error_code']).toBe('ECONNRESET');
    });

    it('records broker.client.uptime_seconds as a positive value', async () => {
      const metric = await findMetric('broker.client.uptime_seconds');
      expect(metric).toBeDefined();
      const value = metric!.dataPoints[0].value as number;
      expect(value).toBeGreaterThan(0);
    });

    it('records broker.client.request.total with flow and allowed attributes', async () => {
      client.recordRequest('broker-server', true);
      client.recordRequest('broker-server', false);
      client.recordRequest('local-client', true);

      const metric = await findMetric('broker.client.request.total');
      const dataPoints = metric!.dataPoints;

      expect(
        dataPoints.find(
          (dp) =>
            dp.attributes['flow'] === 'broker-server' &&
            dp.attributes['allowed'] === 'true',
        )?.value,
      ).toBe(1);
      expect(
        dataPoints.find(
          (dp) =>
            dp.attributes['flow'] === 'broker-server' &&
            dp.attributes['allowed'] === 'false',
        )?.value,
      ).toBe(1);
      expect(
        dataPoints.find(
          (dp) =>
            dp.attributes['flow'] === 'local-client' &&
            dp.attributes['allowed'] === 'true',
        )?.value,
      ).toBe(1);
    });

    it('records broker.client.downstream.request.total with streaming attribute', async () => {
      client.recordDownstreamRequest(true);
      client.recordDownstreamRequest(false);

      const metric = await findMetric('broker.client.downstream.request.total');
      const dataPoints = metric!.dataPoints;

      expect(
        dataPoints.find((dp) => dp.attributes['streaming'] === 'true')?.value,
      ).toBe(1);
      expect(
        dataPoints.find((dp) => dp.attributes['streaming'] === 'false')?.value,
      ).toBe(1);
    });

    it('records broker.client.downstream.duration.seconds', async () => {
      client.recordDownstreamDuration(false, 0.42);
      const metric = await findMetric(
        'broker.client.downstream.duration.seconds',
      );
      expect(metric).toBeDefined();
      expect(metric!.dataPointType).toBe(DataPointType.HISTOGRAM);
      expect(metric!.dataPoints[0].attributes['streaming']).toBe('false');
    });

    it('records broker.client.downstream.status with status_class attribute', async () => {
      client.recordDownstreamStatus('2xx');
      client.recordDownstreamStatus('5xx');

      const metric = await findMetric('broker.client.downstream.status');
      const dataPoints = metric!.dataPoints;

      expect(
        dataPoints.find((dp) => dp.attributes['status_class'] === '2xx')?.value,
      ).toBe(1);
      expect(
        dataPoints.find((dp) => dp.attributes['status_class'] === '5xx')?.value,
      ).toBe(1);
    });

    it('records broker.client.ws.duration.seconds with role attribute', async () => {
      client.recordConnectionDuration('primary', 3600);
      const metric = await findMetric('broker.client.ws.duration.seconds');
      expect(metric).toBeDefined();
      expect(metric!.dataPointType).toBe(DataPointType.HISTOGRAM);
      expect(metric!.dataPoints[0].attributes['role']).toBe('primary');
    });

    it('records broker.client.upstream.response.bytes', async () => {
      client.recordUpstreamResponseBytes(51200);
      const metric = await findMetric('broker.client.upstream.response.bytes');
      expect(metric).toBeDefined();
      expect(metric!.dataPointType).toBe(DataPointType.HISTOGRAM);
      expect(metric!.dataPoints).toHaveLength(1);
    });

    it('records broker.client.inflight.requests as UpDownCounter', async () => {
      client.incrementInflight();
      client.incrementInflight();
      client.decrementInflight();
      const metric = await findMetric('broker.client.inflight.requests');
      expect(metric).toBeDefined();
      expect(metric!.dataPointType).toBe(DataPointType.SUM);
      expect(metric!.dataPoints[0].value).toBe(1);
    });

    it('records broker.client.ws.ping.latency.seconds', async () => {
      client.recordPingLatency(0.042);
      const metric = await findMetric('broker.client.ws.ping.latency.seconds');
      expect(metric).toBeDefined();
      expect(metric!.dataPointType).toBe(DataPointType.HISTOGRAM);
      expect(metric!.dataPoints).toHaveLength(1);
    });

    it('rename view produces broker.nodejs.eventloop.delay.p99', async () => {
      // Wait for the event loop delay histogram to complete at least one sampling interval.
      // The RuntimeNodeInstrumentation uses perf_hooks.monitorEventLoopDelay (default 10ms
      // resolution), so we wait longer to ensure the observable callbacks return data.
      await new Promise((resolve) => setTimeout(resolve, 100));

      const { resourceMetrics } = await reader.collect();
      const names = resourceMetrics.scopeMetrics
        .flatMap((sm) => sm.metrics)
        .map((m) => m.descriptor.name);

      expect(names).toContain('broker.nodejs.eventloop.delay.p99');
      expect(names).not.toContain('nodejs.eventloop.delay.p99');
    });

    it('drop view leaves no nodejs.* metrics in collected output', async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));

      const { resourceMetrics } = await reader.collect();
      const nodejsMetrics = resourceMetrics.scopeMetrics
        .flatMap((sm) => sm.metrics)
        .filter((m) => m.descriptor.name.startsWith('nodejs.'));

      expect(nodejsMetrics).toHaveLength(0);
    });

    it('shutdown resolves cleanly', async () => {
      await expect(client.shutdown()).resolves.toBeUndefined();
    });

    it('forceFlush resolves cleanly', async () => {
      await expect(client.forceFlush()).resolves.toBeUndefined();
    });
  });
});
