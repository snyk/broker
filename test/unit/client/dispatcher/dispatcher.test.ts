import { getServerId } from '../../../../lib/client/dispatcher';

describe('Dispatcher', () => {
  it('getServerId without broker token should throw an error', async () => {
    const expectedError = new Error(
      'BROKER_TOKEN is required to successfully identify itself to the server',
    );
    expectedError.name = 'MISSING_BROKER_TOKEN';

    try {
      await getServerId({}, 'random-client-it');
    } catch (error) {
      expect(error).toStrictEqual(expectedError);
    }
  });
});
