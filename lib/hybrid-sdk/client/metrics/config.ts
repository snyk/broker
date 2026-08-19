import {
  OtelConfig,
  parseOtelConfig,
  RawOtelConfig,
} from '../../common/metrics/otel';

export type RawConfig = RawOtelConfig;
export type Config = OtelConfig;

/**
 * Parse and validate raw string input into a typed Config.
 * Delegates to the shared parseOtelConfig.
 *
 * @param raw - Raw string config values (e.g. from env vars).
 * @returns The validated, typed config.
 * @throws If metricsOtelEndpoint is set but not a valid URL.
 */
export function parse(raw: RawConfig): Config {
  return parseOtelConfig(raw);
}
