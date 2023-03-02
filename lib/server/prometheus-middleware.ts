import * as promBundle from 'express-prom-bundle';
import { RequestHandler } from 'express';

export const applyPrometheusMiddleware = (): RequestHandler => {
  return promBundle({
    buckets: [0.5, 1, 2, 5, 10, 30, 60, 120, 300],
    includeMethod: true,
    includePath: false,
    metricsPath: '/metrics',
    promClient: {
      collectDefaultMetrics: {
        timeout: 3000,
      },
    },
  });
};
