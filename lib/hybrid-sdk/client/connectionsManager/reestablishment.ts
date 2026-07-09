import { log as logger } from '../../../logs/logger';
import { isShuttingDown } from '../../common/utils/signals';
import type { LoadedClientOpts } from '../../common/types/options';

/**
 * Self-heals universal-mode connections torn down by auth-renewal exhaustion.
 * Teardown means auth is failing, so we re-establish on a capped exponential
 * backoff (never immediately) and delegate to syncClientConfig rather than
 * duplicating connection creation. Once the cap is hit we give up and mark the
 * connection so /healthcheck reports it unhealthy.
 *
 * State is module-level, keyed by friendlyName so it survives socket
 * re-creation. synchronizer/manager are imported dynamically in the timer to
 * avoid a load-time cycle (socket → reestablishment → synchronizer → socket).
 */

type ReestablishmentState = 'reestablishing' | 'gave_up';

const DEFAULT_MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 60_000;

/** attempt counter per connection; entry present ⇒ actively re-establishing */
const attemptsByConnection = new Map<string, number>();
/** connections that exhausted their attempts ⇒ terminal, reported unhealthy */
const gaveUpConnections = new Set<string>();
/** pending backoff timers, so we can cancel on recovery/shutdown */
const timersByConnection = new Map<string, NodeJS.Timeout>();

/** Reported by /healthcheck for a configured-but-missing connection. */
export const getReestablishmentState = (
  friendlyName: string,
): ReestablishmentState | undefined => {
  if (gaveUpConnections.has(friendlyName)) {
    return 'gave_up';
  }
  if (
    attemptsByConnection.has(friendlyName) ||
    timersByConnection.has(friendlyName)
  ) {
    return 'reestablishing';
  }
  return undefined;
};

/**
 * Reset a connection's re-establishment state once it recovers (renews
 * successfully), restoring its backoff budget. Emits 'success' only if it was
 * mid-recovery.
 */
export const clearReestablishmentState = (
  friendlyName: string | undefined,
  clientOpts?: LoadedClientOpts,
): void => {
  if (!friendlyName) {
    return;
  }
  const wasRecovering = getReestablishmentState(friendlyName) !== undefined;
  const timer = timersByConnection.get(friendlyName);
  if (timer) {
    clearTimeout(timer);
    timersByConnection.delete(friendlyName);
  }
  attemptsByConnection.delete(friendlyName);
  gaveUpConnections.delete(friendlyName);
  if (wasRecovering) {
    logger.info(
      { friendlyName },
      'Connection recovered; cleared re-establishment state.',
    );
    clientOpts?.metricsClient?.recordConnectionReestablishment(
      'success',
      friendlyName,
    );
  }
};

const attemptReestablishment = async (
  clientOpts: LoadedClientOpts,
  friendlyName: string,
): Promise<void> => {
  timersByConnection.delete(friendlyName);
  if (isShuttingDown()) {
    return;
  }

  const attempt = (attemptsByConnection.get(friendlyName) ?? 0) + 1;
  attemptsByConnection.set(friendlyName, attempt);
  clientOpts.metricsClient?.recordConnectionReestablishment(
    'attempt',
    friendlyName,
  );
  logger.info(
    { friendlyName, attempt },
    'Attempting connection re-establishment.',
  );

  try {
    // Dynamic import avoids the load-time cycle; the module is already cached here.
    const { syncClientConfig } = await import('./synchronizer.js');
    const { websocketConnections, getGlobalIdentifyingMetadata } = await import(
      './manager.js'
    );
    // syncClientConfig's missing-connection branch re-creates the pair. If auth
    // is still broken, its renewal loop tears it down and re-enters this backoff.
    await syncClientConfig(
      clientOpts,
      websocketConnections,
      getGlobalIdentifyingMetadata(),
    );
  } catch (err) {
    logger.error(
      { friendlyName, attempt, err },
      'Connection re-establishment attempt failed; rescheduling.',
    );
    scheduleConnectionReestablishment(clientOpts, friendlyName);
  }
};

/**
 * Schedule a backed-off re-establishment, or give up (marking it unhealthy)
 * once the attempt cap is reached. Safe to call repeatedly — the backoff grows
 * with the attempt count.
 */
export const scheduleConnectionReestablishment = (
  clientOpts: LoadedClientOpts,
  friendlyName: string | undefined,
): void => {
  if (!friendlyName) {
    return;
  }
  if (
    String(clientOpts.config.brokerRenewalReestablishmentEnabled) === 'false'
  ) {
    logger.warn(
      { friendlyName },
      'Connection re-establishment disabled; leaving connection torn down.',
    );
    return;
  }
  if (isShuttingDown()) {
    return;
  }

  const attempt = attemptsByConnection.get(friendlyName) ?? 0;
  const maxAttempts =
    parseInt(
      String(clientOpts.config.brokerRenewalMaxReestablishmentAttempts),
    ) || DEFAULT_MAX_ATTEMPTS;

  if (attempt >= maxAttempts) {
    const existing = timersByConnection.get(friendlyName);
    if (existing) {
      clearTimeout(existing);
      timersByConnection.delete(friendlyName);
    }
    attemptsByConnection.delete(friendlyName);
    gaveUpConnections.add(friendlyName);
    logger.error(
      { friendlyName, attempt, maxAttempts },
      'Connection re-establishment exhausted; giving up. /healthcheck will report this connection as failed.',
    );
    clientOpts.metricsClient?.recordConnectionReestablishment(
      'exhausted',
      friendlyName,
    );
    return;
  }

  // Cancel any pending timer before scheduling a fresh one.
  const existing = timersByConnection.get(friendlyName);
  if (existing) {
    clearTimeout(existing);
  }

  const delayMs = BASE_DELAY_MS * 2 ** attempt;
  logger.warn(
    { friendlyName, nextAttempt: attempt + 1, maxAttempts, delayMs },
    'Scheduling connection re-establishment.',
  );

  const timer = setTimeout(() => {
    void attemptReestablishment(clientOpts, friendlyName);
  }, delayMs);
  timer.unref();
  timersByConnection.set(friendlyName, timer);
};

/** Test-only reset of module-level state. */
export const __resetReestablishmentStateForTests = (): void => {
  for (const timer of timersByConnection.values()) {
    clearTimeout(timer);
  }
  timersByConnection.clear();
  attemptsByConnection.clear();
  gaveUpConnections.clear();
};
