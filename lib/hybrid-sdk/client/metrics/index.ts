import { log as logger } from '../../../logs/logger';
import { Config, parse, RawConfig } from './config';
import { Client } from './client';
import { NoopClient } from './noopClient';
import { OtelClient } from './otelClient';

/**
 * Create a {@link Client} from raw config strings.
 * Validates via {@link parse} and returns an OTel-backed client when an
 * endpoint is configured or a no-op client otherwise.
 */
export function createClient(raw: RawConfig): Client {
  let config: Config;
  try {
    config = parse(raw);
  } catch (cause) {
    throw new Error('failed to parse metrics config', { cause });
  }

  if (!config.otelEndpoint) {
    logger.info('OTel metrics endpoint not configured, using noop metrics.');
    return new NoopClient();
  }

  logger.info(
    {
      endpoint: config.otelEndpoint.toString(),
      exportIntervalMs: config.otelExportIntervalMs,
    },
    'Initializing OTel metrics client.',
  );

  try {
    return new OtelClient({
      endpoint: config.otelEndpoint,
      exportIntervalMs: config.otelExportIntervalMs,
    });
  } catch (cause) {
    throw new Error('failed to create OTel metrics client', { cause });
  }
}

export { RawConfig } from './config';
export { Client } from './client';
export { NoopClient } from './noopClient';
export { OtelClient } from './otelClient';
