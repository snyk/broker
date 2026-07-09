jest.mock(
  '../../../../lib/hybrid-sdk/client/connectionsManager/synchronizer',
  () => ({
    syncClientConfig: jest.fn().mockResolvedValue(undefined),
  }),
);

jest.mock(
  '../../../../lib/hybrid-sdk/client/connectionsManager/manager',
  () => ({
    websocketConnections: [],
    getGlobalIdentifyingMetadata: jest.fn(() => ({})),
  }),
);

jest.mock('../../../../lib/hybrid-sdk/common/utils/signals', () => ({
  isShuttingDown: jest.fn(() => false),
}));

import {
  scheduleConnectionReestablishment,
  clearReestablishmentState,
  getReestablishmentState,
  __resetReestablishmentStateForTests,
} from '../../../../lib/hybrid-sdk/client/connectionsManager/reestablishment';

const {
  syncClientConfig,
} = require('../../../../lib/hybrid-sdk/client/connectionsManager/synchronizer');
const {
  isShuttingDown,
} = require('../../../../lib/hybrid-sdk/common/utils/signals');

// Must match the fixed base delay in reestablishment.ts.
const BASE_DELAY_MS = 60_000;

const makeClientOpts = (overrides: Record<string, any> = {}) => {
  const recordConnectionReestablishment = jest.fn();
  return {
    metricsClient: { recordConnectionReestablishment },
    config: {
      brokerRenewalReestablishmentEnabled: true,
      brokerRenewalMaxReestablishmentAttempts: 3,
      ...overrides,
    },
  } as any;
};

/** Drive one full attempt: schedule → advance past its backoff → fire. */
const runOneAttempt = async (
  clientOpts: any,
  name: string,
  delayMs: number,
) => {
  scheduleConnectionReestablishment(clientOpts, name);
  await jest.advanceTimersByTimeAsync(delayMs);
};

describe('connection re-establishment', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    __resetReestablishmentStateForTests();
    isShuttingDown.mockReturnValue(false);
    syncClientConfig.mockResolvedValue(undefined);
  });

  afterEach(() => {
    __resetReestablishmentStateForTests();
    jest.useRealTimers();
  });

  it('reports reestablishing once scheduled and fires syncClientConfig after the backoff', async () => {
    const clientOpts = makeClientOpts();

    scheduleConnectionReestablishment(clientOpts, 'conn-A');
    expect(getReestablishmentState('conn-A')).toBe('reestablishing');
    expect(syncClientConfig).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(BASE_DELAY_MS);

    expect(syncClientConfig).toHaveBeenCalledTimes(1);
    expect(
      clientOpts.metricsClient.recordConnectionReestablishment,
    ).toHaveBeenCalledWith('attempt', 'conn-A');
  });

  it('backs off exponentially between successive attempts', async () => {
    const clientOpts = makeClientOpts();

    // Attempt 1 uses base * 2^0.
    scheduleConnectionReestablishment(clientOpts, 'conn-A');
    await jest.advanceTimersByTimeAsync(BASE_DELAY_MS - 1);
    expect(syncClientConfig).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(syncClientConfig).toHaveBeenCalledTimes(1);

    // Attempt 2 uses base * 2^1 — should NOT fire at the base delay.
    scheduleConnectionReestablishment(clientOpts, 'conn-A');
    await jest.advanceTimersByTimeAsync(BASE_DELAY_MS);
    expect(syncClientConfig).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(BASE_DELAY_MS);
    expect(syncClientConfig).toHaveBeenCalledTimes(2);
  });

  it('gives up after the attempt cap and reports gave_up', async () => {
    const clientOpts = makeClientOpts(); // max = 3

    // Three attempts fire (base, 2x, 4x backoffs).
    await runOneAttempt(clientOpts, 'conn-A', BASE_DELAY_MS);
    await runOneAttempt(clientOpts, 'conn-A', BASE_DELAY_MS * 2);
    await runOneAttempt(clientOpts, 'conn-A', BASE_DELAY_MS * 4);
    expect(syncClientConfig).toHaveBeenCalledTimes(3);

    // The 4th schedule hits the cap → give up.
    scheduleConnectionReestablishment(clientOpts, 'conn-A');
    expect(getReestablishmentState('conn-A')).toBe('gave_up');
    expect(
      clientOpts.metricsClient.recordConnectionReestablishment,
    ).toHaveBeenCalledWith('exhausted', 'conn-A');

    // No further attempts after giving up.
    await jest.advanceTimersByTimeAsync(BASE_DELAY_MS * 100);
    expect(syncClientConfig).toHaveBeenCalledTimes(3);
  });

  it('does nothing while shutting down', async () => {
    const clientOpts = makeClientOpts();
    isShuttingDown.mockReturnValue(true);

    scheduleConnectionReestablishment(clientOpts, 'conn-A');
    expect(getReestablishmentState('conn-A')).toBeUndefined();
    await jest.advanceTimersByTimeAsync(BASE_DELAY_MS);
    expect(syncClientConfig).not.toHaveBeenCalled();
  });

  it('is disabled by the feature flag', async () => {
    const clientOpts = makeClientOpts({
      brokerRenewalReestablishmentEnabled: false,
    });

    scheduleConnectionReestablishment(clientOpts, 'conn-A');
    expect(getReestablishmentState('conn-A')).toBeUndefined();
    await jest.advanceTimersByTimeAsync(BASE_DELAY_MS);
    expect(syncClientConfig).not.toHaveBeenCalled();
  });

  it('clearReestablishmentState resets budget and gave_up, emitting success', async () => {
    const clientOpts = makeClientOpts();

    scheduleConnectionReestablishment(clientOpts, 'conn-A');
    expect(getReestablishmentState('conn-A')).toBe('reestablishing');

    clearReestablishmentState('conn-A', clientOpts);

    expect(getReestablishmentState('conn-A')).toBeUndefined();
    expect(
      clientOpts.metricsClient.recordConnectionReestablishment,
    ).toHaveBeenCalledWith('success', 'conn-A');

    // Cancelled timer never fires.
    await jest.advanceTimersByTimeAsync(BASE_DELAY_MS);
    expect(syncClientConfig).not.toHaveBeenCalled();
  });

  it('clearReestablishmentState is a no-op (no success metric) when nothing was recovering', () => {
    const clientOpts = makeClientOpts();
    clearReestablishmentState('never-seen', clientOpts);
    expect(
      clientOpts.metricsClient.recordConnectionReestablishment,
    ).not.toHaveBeenCalled();
  });

  it('reschedules when a re-establishment attempt throws', async () => {
    const clientOpts = makeClientOpts();
    syncClientConfig.mockRejectedValueOnce(new Error('sync boom'));

    scheduleConnectionReestablishment(clientOpts, 'conn-A');
    await jest.advanceTimersByTimeAsync(BASE_DELAY_MS);
    expect(syncClientConfig).toHaveBeenCalledTimes(1);
    // Still retrying, not given up.
    expect(getReestablishmentState('conn-A')).toBe('reestablishing');
  });
});
