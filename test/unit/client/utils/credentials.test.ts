import { checkBitbucketPatCredentials } from '../../../../lib/hybrid-sdk/client/utils/credentials';
import { makeRequestToDownstream } from '../../../../lib/hybrid-sdk/http/request';

jest.mock('../../../../lib/hybrid-sdk/http/request', () => ({
  makeRequestToDownstream: jest.fn(),
}));

describe('checkBitbucketPatCredentials', () => {
  const mockConfig = {
    brokerClientValidationUrl: 'http://fake.bitbucket.server/rest/api/1.0/projects',
  };
  const brokerClientValidationMethod = 'GET';
  const brokerClientValidationTimeoutMs = 5000;

  const mockedMakeRequestToDownstream = makeRequestToDownstream as jest.Mock;


  it('should return 200 when validation is successful', async () => {
    mockedMakeRequestToDownstream.mockResolvedValue({
      statusCode: 200,
      headers: { 'x-ausername': 'testuser', 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'success' }),
    });

    const { data, errorOccurred } = await checkBitbucketPatCredentials(
      'Bearer test-token',
      mockConfig,
      brokerClientValidationMethod,
      brokerClientValidationTimeoutMs,
    );

    expect(errorOccurred).toBe(false);
    expect(data.ok).toBe(true);
    expect(data.brokerClientValidationUrlStatusCode).toBe(200);
    expect(mockedMakeRequestToDownstream).toHaveBeenCalledWith(expect.objectContaining({
        url: mockConfig.brokerClientValidationUrl,
        headers: { 'authorization': 'Bearer test-token' },
        method: brokerClientValidationMethod,
    }));
  });

  it('should return 401 when x-ausername header is missing', async () => {
    mockedMakeRequestToDownstream.mockResolvedValue({
      statusCode: 200,
      headers: { 'content-type': 'application/json' }, // No x-ausername
      body: JSON.stringify({ message: 'success but no header' }),
    });

    const { data, errorOccurred } = await checkBitbucketPatCredentials(
      'Bearer test-token',
      mockConfig,
      brokerClientValidationMethod,
      brokerClientValidationTimeoutMs,
    );

    expect(errorOccurred).toBe(true);
    expect(data.ok).toBe(false);
    expect(data.brokerClientValidationUrlStatusCode).toBe(401);
    expect(data.error).toBe('Bitbucket PAT systemcheck failed, credentials are invalid');
  });

  it('should return ok: false and errorOccurred: true when makeRequestToDownstream throws an error', async () => {
    const errorMessage = 'Network Error';
    mockedMakeRequestToDownstream.mockRejectedValue(new Error(errorMessage));

    const { data, errorOccurred } = await checkBitbucketPatCredentials(
      'Bearer test-token',
      mockConfig,
      brokerClientValidationMethod,
      brokerClientValidationTimeoutMs,
    );

    expect(errorOccurred).toBe(true);
    expect(data.ok).toBe(false);
  });
});
