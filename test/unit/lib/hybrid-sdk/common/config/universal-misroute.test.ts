// Pin the WARN level + payload shape for the universal-broker "unable to
// find configuration type" misroute log.
//
// Before: two ERRORs per request (one for missing type, one for missing key)
// dumping `config.integrations`. A single misconfigured connection produced
// unbounded ERROR + alert-fatigue.
//
// After: one WARN per request — collapsed branches, payload trimmed to
// (identifier, contextId, configuredIdentifiers) so the customer can compare
// against their actual config. No dedupe state — the WARN level alone
// removes the customer-alerting concern; per-request WARN volume can be
// revisited with real data if it becomes a pain point.

jest.mock('../../../../../../lib/hybrid-sdk/common/config/config', () => ({
  getConfig: jest.fn(() => ({
    brokerClientConfiguration: {
      common: { default: {}, required: {} },
    },
  })),
  expandPlaceholderValuesInFlatList: jest.fn((x) => x),
}));

jest.mock(
  '../../../../../../lib/hybrid-sdk/common/config/pluginsConfig',
  () => ({
    getPluginsConfig: jest.fn(() => ({})),
    getPluginsContextConfig: jest.fn(() => ({})),
  }),
);

jest.mock(
  '../../../../../../lib/hybrid-sdk/client/utils/filterSelection',
  () => ({
    determineFilterType: jest.fn((type) => type),
  }),
);

import { getConfigForIdentifier } from '../../../../../../lib/hybrid-sdk/common/config/universal';
import { log as logger } from '../../../../../../lib/logs/logger';

describe('universal getConfigForIdentifier — misroute WARN', () => {
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs exactly one WARN (not ERROR) when an identifier does not match any configured connection', () => {
    const config = {
      connections: {
        'conn-a': { identifier: 'real-token', type: 'github' },
      },
      integrations: { 'conn-a': 'github' },
    };

    getConfigForIdentifier('unknown-token', config);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: 'unknown-token',
        configuredIdentifiers: ['conn-a'],
      }),
      expect.stringContaining('Unable to find configuration type for'),
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('does not dump `integrations` in the payload (privacy + payload-bloat)', () => {
    const config = {
      connections: { 'conn-a': { identifier: 'real-token', type: 'github' } },
      integrations: { 'conn-a': 'github' },
    };

    getConfigForIdentifier('unknown-token', config);

    const payload = warnSpy.mock.calls[0][0];
    expect(payload).not.toHaveProperty('integrations');
  });

  it('emits one WARN per call (no dedupe state) — N mis-routes ⇒ N WARNs', () => {
    // Intentional: dedupe was removed in favour of the simpler level-only
    // fix. If per-request WARN volume becomes a real operator complaint,
    // add dedupe back with data informing the cap and eviction policy.
    const config = {
      connections: { 'conn-a': { identifier: 'real-token', type: 'github' } },
    };

    for (let i = 0; i < 5; i++) {
      getConfigForIdentifier('unknown-token', config);
    }

    expect(warnSpy).toHaveBeenCalledTimes(5);
  });

  it('propagates contextId in the payload when provided', () => {
    const config = {
      connections: { 'conn-a': { identifier: 'real-token', type: 'github' } },
    };

    getConfigForIdentifier('unknown-token', config, 'ctx-1');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: 'unknown-token',
        contextId: 'ctx-1',
        configuredIdentifiers: ['conn-a'],
      }),
      expect.any(String),
    );
  });

  it('preserves the pre-existing ReferenceError throw when config.connections is undefined', () => {
    // `findConnectionWithIdentifier` throws before the misroute branch runs.
    // Pinning this so we don't accidentally swallow it during refactors.
    const config = { integrations: {} };
    expect(() => getConfigForIdentifier('any-token', config)).toThrow(
      ReferenceError,
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('still throws ERROR for the contextId path when the connection IS found but the context is missing', () => {
    // This branch is a different condition (existing connection + missing/
    // disabled context), continues to throw, so each occurrence is bounded
    // by one thrown exception. The misroute WARN must NOT fire for this
    // path — the connection was found.
    const config = {
      connections: {
        'conn-a': {
          identifier: 'real-token',
          type: 'github',
          contexts: { 'ctx-good': {} },
        },
      },
    };

    expect(() =>
      getConfigForIdentifier('real-token', config, 'ctx-missing'),
    ).toThrow(/Unable to find context ctx-missing/);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionKey: 'conn-a',
        contextId: 'ctx-missing',
      }),
      expect.stringContaining('Unable to find active context'),
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
