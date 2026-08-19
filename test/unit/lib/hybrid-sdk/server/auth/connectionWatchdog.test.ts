import { getSocketConnections } from '../../../../../../lib/hybrid-sdk/server/socket';

jest.mock('../../../../../../lib/hybrid-sdk/common/config/config', () => ({
  getConfig: jest.fn(() => ({})),
}));

jest.mock('../../../../../../lib/hybrid-sdk/server/socket', () => ({
  getSocketConnections: jest.fn(),
}));

jest.mock('../../../../../../lib/logs/logger', () => ({
  log: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

import { disconnectConnectionsWithStaleCreds } from '../../../../../../lib/hybrid-sdk/server/auth/connectionWatchdog';

const mockedGetSocketConnections = getSocketConnections as jest.MockedFunction<
  typeof getSocketConnections
>;

function makeClient(credsValidationTime: string) {
  return { socket: { end: jest.fn() }, credsValidationTime };
}

function makeMetricsClient() {
  return {
    observeStaleCredsSweepDuration: jest.fn(),
    incrementStaleCredsDisconnected: jest.fn(),
    forceFlush: jest.fn().mockResolvedValue(undefined),
    shutdown: jest.fn(),
  };
}

describe('disconnectConnectionsWithStaleCreds', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('disconnects only stale connections and reports counts once per sweep', async () => {
    const staleTime = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const freshTime = new Date().toISOString();

    const staleClientA = makeClient(staleTime);
    const staleClientB = makeClient(staleTime);
    const freshClient = makeClient(freshTime);

    mockedGetSocketConnections.mockReturnValue(
      new Map([
        ['conn-1', [staleClientA, freshClient]],
        ['conn-2', [staleClientB]],
      ]) as any,
    );

    const metricsClient = makeMetricsClient();

    await disconnectConnectionsWithStaleCreds(metricsClient as any);

    expect(staleClientA.socket.end).toHaveBeenCalledTimes(1);
    expect(staleClientB.socket.end).toHaveBeenCalledTimes(1);
    expect(freshClient.socket.end).not.toHaveBeenCalled();
    expect(metricsClient.incrementStaleCredsDisconnected).toHaveBeenCalledTimes(
      2,
    );
    expect(metricsClient.observeStaleCredsSweepDuration).toHaveBeenCalledTimes(
      1,
    );
    expect(metricsClient.forceFlush).toHaveBeenCalledTimes(1);
  });

  it('still observes a sweep duration with zero stale connections', async () => {
    const freshTime = new Date().toISOString();
    const freshClient = makeClient(freshTime);

    mockedGetSocketConnections.mockReturnValue(
      new Map([['conn-1', [freshClient]]]) as any,
    );

    const metricsClient = makeMetricsClient();

    await disconnectConnectionsWithStaleCreds(metricsClient as any);

    expect(freshClient.socket.end).not.toHaveBeenCalled();
    expect(
      metricsClient.incrementStaleCredsDisconnected,
    ).not.toHaveBeenCalled();
    expect(metricsClient.observeStaleCredsSweepDuration).toHaveBeenCalledTimes(
      1,
    );
    expect(metricsClient.forceFlush).toHaveBeenCalledTimes(1);
  });

  it('logs a warning without throwing when forceFlush rejects', async () => {
    const freshTime = new Date().toISOString();
    const freshClient = makeClient(freshTime);

    mockedGetSocketConnections.mockReturnValue(
      new Map([['conn-1', [freshClient]]]) as any,
    );

    const metricsClient = makeMetricsClient();
    metricsClient.forceFlush.mockRejectedValue(new Error('export failed'));

    await expect(
      disconnectConnectionsWithStaleCreds(metricsClient as any),
    ).resolves.toBeUndefined();
  });
});
