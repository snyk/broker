jest.mock('fs');
jest.mock('../../../../lib/hybrid-sdk/http/request');
jest.mock('../../../../lib/hybrid-sdk/client/auth/oauth', () => ({
  getAccessToken: jest.fn().mockResolvedValue('Bearer test'),
  invalidateToken: jest.fn(),
}));

import * as fs from 'fs';
import { retrieveConnectionsForDeployment } from '../../../../lib/hybrid-sdk/client/config/remoteConfig';
import * as httpRequest from '../../../../lib/hybrid-sdk/http/request';
import { log as logger } from '../../../../lib/logs/logger';
import { ClientOpts } from '../../../../lib/hybrid-sdk/common/types/options';

const mockedFs = jest.mocked(fs);
const mockedHttpRequest = jest.mocked(httpRequest);

const baseClientOpts = {
  config: {
    deploymentId: 'dep-1',
    apiVersion: '2024-01-01',
    API_BASE_URL: 'https://api.example.com',
    brokerClientId: 'client-1',
  },
} as unknown as ClientOpts;

describe('retrieveConnectionsForDeployment — file-missing guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedHttpRequest.makeRequestToDownstream.mockResolvedValue({
      statusCode: 200,
      headers: {},
      body: JSON.stringify({ data: [] }),
    } as any);
  });

  it('returns early — skips network and file I/O — when universal file is missing', async () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    mockedFs.existsSync.mockReturnValue(false);

    await expect(
      retrieveConnectionsForDeployment(baseClientOpts, '/tmp/missing.json'),
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ universalFilePath: '/tmp/missing.json' }),
      expect.stringContaining('missing during sync'),
    );
    expect(mockedHttpRequest.makeRequestToDownstream).not.toHaveBeenCalled();
    expect(mockedFs.readFileSync).not.toHaveBeenCalled();
    expect(mockedFs.writeFileSync).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('proceeds to read+write when the file exists', async () => {
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(
      Buffer.from(JSON.stringify({ CONNECTIONS: {} })),
    );

    await retrieveConnectionsForDeployment(baseClientOpts, '/tmp/present.json');

    expect(mockedFs.readFileSync).toHaveBeenCalledWith('/tmp/present.json');
    expect(mockedFs.writeFileSync).toHaveBeenCalledTimes(1);
  });
});
