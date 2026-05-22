import { retrieveAndLoadRemoteConfigSync } from '../../../lib/hybrid-sdk/client/connectionsManager/remoteConnectionSync';
import * as remoteConfig from '../../../lib/hybrid-sdk/client/config/remoteConfig';
import * as configHelpers from '../../../lib/hybrid-sdk/client/config/configHelpers';
import * as validator from '../../../lib/hybrid-sdk/client/connectionsManager/validator';
import * as signals from '../../../lib/hybrid-sdk/common/utils/signals';
import * as fs from 'node:fs';
import { log as logger } from '../../../lib/logs/logger';
import { LoadedClientOpts } from '../../../lib/hybrid-sdk/common/types/options';

jest.mock('../../../lib/hybrid-sdk/client/config/remoteConfig');
jest.mock('../../../lib/hybrid-sdk/client/config/configHelpers');
jest.mock('../../../lib/hybrid-sdk/client/connectionsManager/validator');
jest.mock('../../../lib/hybrid-sdk/common/utils/signals', () => ({
  isShuttingDown: jest.fn(() => false),
  addIntervalToTerminalHandlers: jest.fn(),
  addTimeoutToTerminalHandlers: jest.fn(),
  clearAndRemoveInterval: jest.fn(),
  clearAndRemoveTimeout: jest.fn(),
}));
jest.mock('node:fs', () => ({
  ...jest.requireActual('node:fs'),
  existsSync: jest.fn(),
}));

const mockedRemoteConfig = jest.mocked(remoteConfig);
const mockedConfigHelpers = jest.mocked(configHelpers);
const mockedValidator = jest.mocked(validator);
const mockedSignals = jest.mocked(signals);
const mockedExistsSync = jest.mocked(fs.existsSync);

const clientOpts = {} as LoadedClientOpts;

describe('retrieveAndLoadRemoteConfigSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSignals.isShuttingDown.mockReturnValue(false);
    // Default: file exists, so validator/reloadConfig are reached.
    mockedExistsSync.mockReturnValue(true);
  });

  it('returns early without doing any I/O when isShuttingDown() is true', async () => {
    mockedSignals.isShuttingDown.mockReturnValue(true);

    await retrieveAndLoadRemoteConfigSync(clientOpts);

    expect(
      mockedRemoteConfig.retrieveConnectionsForDeployment,
    ).not.toHaveBeenCalled();
    expect(
      mockedValidator.validateUniversalConnectionsRemoteConfig,
    ).not.toHaveBeenCalled();
    expect(mockedConfigHelpers.reloadConfig).not.toHaveBeenCalled();
  });

  it('catches errors from retrieveConnectionsForDeployment and emits logger.warn instead of rethrowing', async () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    const boom = new Error('ENOENT: simulated');
    mockedRemoteConfig.retrieveConnectionsForDeployment.mockRejectedValueOnce(
      boom,
    );

    await expect(
      retrieveAndLoadRemoteConfigSync(clientOpts),
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ err: boom }),
      expect.stringContaining('Remote config sync failed'),
    );

    warnSpy.mockRestore();
  });

  it('catches errors from validateUniversalConnectionsRemoteConfig and emits logger.warn', async () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    mockedRemoteConfig.retrieveConnectionsForDeployment.mockResolvedValueOnce(
      undefined,
    );
    const boom = new Error('validator boom');
    mockedValidator.validateUniversalConnectionsRemoteConfig.mockImplementationOnce(
      () => {
        throw boom;
      },
    );

    await expect(
      retrieveAndLoadRemoteConfigSync(clientOpts),
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ err: boom }),
      expect.any(String),
    );

    warnSpy.mockRestore();
  });

  it('runs the full happy path when not shutting down and no errors thrown', async () => {
    mockedRemoteConfig.retrieveConnectionsForDeployment.mockResolvedValueOnce(
      undefined,
    );
    mockedValidator.validateUniversalConnectionsRemoteConfig.mockReturnValueOnce(
      undefined as any,
    );
    mockedConfigHelpers.reloadConfig.mockResolvedValueOnce(undefined as any);

    await retrieveAndLoadRemoteConfigSync(clientOpts);

    expect(
      mockedRemoteConfig.retrieveConnectionsForDeployment,
    ).toHaveBeenCalledTimes(1);
    expect(
      mockedValidator.validateUniversalConnectionsRemoteConfig,
    ).toHaveBeenCalledTimes(1);
    expect(mockedConfigHelpers.reloadConfig).toHaveBeenCalledTimes(1);
  });

  it('skips validation and reload (no warn) when the universal config file is missing after retrieve', async () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    const debugSpy = jest.spyOn(logger, 'debug').mockImplementation(() => {});
    mockedRemoteConfig.retrieveConnectionsForDeployment.mockResolvedValueOnce(
      undefined,
    );
    mockedExistsSync.mockReturnValue(false);

    await retrieveAndLoadRemoteConfigSync(clientOpts);

    expect(
      mockedValidator.validateUniversalConnectionsRemoteConfig,
    ).not.toHaveBeenCalled();
    expect(mockedConfigHelpers.reloadConfig).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(debugSpy).toHaveBeenCalledWith(
      expect.objectContaining({ universalFilePath: expect.any(String) }),
      expect.stringContaining('missing'),
    );

    warnSpy.mockRestore();
    debugSpy.mockRestore();
  });
});
