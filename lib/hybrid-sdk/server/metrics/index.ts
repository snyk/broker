import {
  createOtelBackedClient,
  RawOtelConfig,
} from '../../common/metrics/otel';
import { Client } from './client';
import { NoopClient } from './noopClient';
import { OtelClient } from './otelClient';

/**
 * Create a metrics client from raw config strings. Returns an OTel-backed
 * client when an endpoint is configured or a no-op client otherwise.
 *
 * @param raw - Raw string config values (e.g. from env vars).
 * @returns A Client implementation.
 * @throws If the raw config is invalid, or constructing the OTel-backed
 *   client fails.
 */
export function createClient(raw: RawOtelConfig): Client {
  return createOtelBackedClient<Client>(raw, NoopClient, OtelClient);
}

export { RawOtelConfig } from '../../common/metrics/otel';
export { Client } from './client';
export { NoopClient } from './noopClient';
export { OtelClient } from './otelClient';
