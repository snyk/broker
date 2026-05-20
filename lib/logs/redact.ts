/**
 * Deep redaction for objects passed to logger.{trace,debug,...}.
 *
 * Why this exists: `sanitise()` in ./logger.ts is string-based — it only
 * replaces occurrences of credential *values* it can read from `getConfig()`.
 * It does not know about arbitrary nested objects, and `sanitiseObject` only
 * walks one level deep. Plugin sites that log full `connectionConfig` /
 * `pluginConfig` objects therefore bypass redaction entirely.
 *
 * `redactConfig` is the explicit, call-site fix: wrap any object that may
 * contain credentials before passing it to the logger. Keys are preserved so
 * support can still see what fields are populated; only values are masked.
 */

export const REDACTED = '***REDACTED***';

// Credential env-var names, grouped by where each variable physically resides
// in the broker config tree. The grouping matters for the string sanitiser in
// ./logger.ts — each of its three loops only iterates the names that can
// actually appear in the structure it's scanning, so widening one group adds
// per-record work in that loop. Group new credentials by where they're stored,
// not alphabetically.

// Top-level: read as `config[var]`. Also iterated per-connection in universal
// broker mode (each connection can override these).
export const COMMON_CREDENTIAL_ENV_VARS: readonly string[] = Object.freeze([
  'BROKER_TOKEN',
  'GITHUB_TOKEN',
  'GITHUB_TOKEN_POOL',
  'BITBUCKET_USERNAME',
  'BITBUCKET_PASSWORD',
  'BITBUCKET_PAT',
  'GITLAB_TOKEN',
  'JIRA_USERNAME',
  'JIRA_PASSWORD',
  'JIRA_PAT',
  'AZURE_REPOS_TOKEN',
  'ARTIFACTORY_URL',
  'CR_CREDENTIALS',
  'CR_AGENT_URL',
  'CR_BASE',
  'CR_USERNAME',
  'CR_PASSWORD',
  'CR_TOKEN',
  'CR_ROLE_ARN',
  'CR_EXTERNAL_ID',
  'CR_REGION',
  'GIT_USERNAME',
  'GIT_PASSWORD',
  'GIT_CLIENT_URL',
  'NEXUS_URL',
  'BASE_NEXUS_URL',
  'BASE_NEXUS2_URL',
  'CHECKMARX_PASSWORD',
  'SONARQUBE_API_TOKEN',
  'GITHUB_APP_PRIVATE_PEM_PATH',
  'GPG_PRIVATE_KEY',
  'GPG_PASSPHRASE',
]);

// Connection-only: live under `config.connections[key]` in universal broker
// mode and don't appear at the top level.
export const PER_CONNECTION_CREDENTIAL_ENV_VARS: readonly string[] =
  Object.freeze(['GITHUB_APP_CLIENT_ID']);

// Plugin-only: live under `pluginsConfig[key]` in universal broker mode.
export const PER_PLUGIN_CREDENTIAL_ENV_VARS: readonly string[] = Object.freeze([
  'GHA_ACCESS_TOKEN',
  'JWT_TOKEN',
]);

// Union of all credential env-var names — the denylist used by the object
// walker below. It doesn't care where a key lives, only that the name appears
// as a key anywhere in the input.
export const CREDENTIAL_ENV_VARS: readonly string[] = Object.freeze([
  ...new Set([
    ...COMMON_CREDENTIAL_ENV_VARS,
    ...PER_CONNECTION_CREDENTIAL_ENV_VARS,
    ...PER_PLUGIN_CREDENTIAL_ENV_VARS,
  ]),
]);

const CREDENTIAL_ENV_VAR_SET = new Set(CREDENTIAL_ENV_VARS);

export const CREDENTIAL_KEY_PATTERN =
  /TOKEN|PASSWORD|SECRET|PASSPHRASE|PEM|CREDENTIALS|PRIVATE_KEY|AUTHORIZATION/i;

function isSecretKey(key: string): boolean {
  return CREDENTIAL_ENV_VAR_SET.has(key) || CREDENTIAL_KEY_PATTERN.test(key);
}

/**
 * Returns a redacted deep-clone of `value` suitable for passing to a logger.
 *
 * Serialization contract: mirrors `JSON.stringify`. A custom `toJSON()` is
 * honoured (and its output is then walked + redacted), arrays are walked
 * element-wise, plain objects iterate own enumerable string keys. Non-
 * enumerable properties, symbol keys, prototype methods, and class identity
 * are dropped — same as bunyan's eventual JSON serialization would have done.
 * Designed for POJO config inputs; not a general-purpose object cloner.
 */
export function redactConfig(value: unknown): unknown {
  return redactWithSeen(value, new WeakSet());
}

function redactWithSeen(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (seen.has(value as object)) {
    return '[Circular]';
  }
  seen.add(value as object);

  // Match JSON.stringify semantics: if the object exposes a toJSON, that's
  // what bunyan would have serialised. Walk + redact its output instead of
  // silently dropping the instance to `{}`.
  const toJSON = (value as { toJSON?: unknown }).toJSON;
  if (typeof toJSON === 'function') {
    return redactWithSeen(toJSON.call(value), seen);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactWithSeen(item, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    // Falsy values (empty string, 0, false, null, undefined) under secret
    // keys are preserved as-is so support can distinguish "not set" /
    // "configured to empty" from a real value being redacted — matches the
    // truthy `if (config[variable])` check in the existing sanitise().
    if (isSecretKey(key) && v) {
      result[key] = REDACTED;
    } else {
      result[key] = redactWithSeen(v, seen);
    }
  }
  return result;
}
