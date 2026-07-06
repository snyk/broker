import { getProxyForUrl } from 'proxy-from-env';
import { bootstrap } from 'global-agent';

/**
 * Normalize lowercase proxy env vars into their uppercase equivalents so that
 * downstream consumers (proxy-from-env / global-agent) see a consistent set.
 */
export function normalizeProxyEnv(): void {
  if (process.env.HTTP_PROXY || process.env.http_proxy) {
    process.env.HTTP_PROXY = process.env.HTTP_PROXY || process.env.http_proxy;
  }
  if (process.env.HTTPS_PROXY || process.env.https_proxy) {
    process.env.HTTPS_PROXY =
      process.env.HTTPS_PROXY || process.env.https_proxy;
  }
  if (process.env.NO_PROXY || process.env.no_proxy) {
    process.env.NO_PROXY = process.env.NO_PROXY || process.env.no_proxy;
  }
}

/**
 * Node ignores HTTP_PROXY/HTTPS_PROXY until global-agent patches http/https.
 * Call before outbound requests so they route through the proxy (respects
 * NO_PROXY); idempotent.
 */
export function initGlobalProxy(url: string | undefined): void {
  normalizeProxyEnv();
  if (url && getProxyForUrl(url)) {
    bootstrap({
      environmentVariableNamespace: '',
    });
  }
}
