const nock = require('nock');
import { setAuthConfigKey } from '../../../../lib/client/auth/oauth';
import { getServerId } from '../../../../lib/client/dispatcher';

const serverUrl = 'http://broker-server-dispatcher';

describe('Dispatcher', () => {
  beforeAll(async () => {
    setAuthConfigKey('accessToken', { expireIn: 123, authHeader: 'dummy' });
    nock(`${serverUrl}`)
      .persist()
      .post(
        `/hidden/broker/ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad/connections/random-client-id?version=2022-12-01~experimental`,
        (requestBody) => {
          return (
            requestBody.data.attributes.deployment_location.length > 0 &&
            requestBody.data.attributes.broker_token_first_char == 'a'
          );
        },
      )

      .reply((uri, requestBody) => {
        const response = {
          data: {
            attributes: {
              server_id: `${
                JSON.parse(requestBody).data.attributes.deployment_location
              }`,
            },
          },
        };
        return [200, response];
      });
  });

  it.skip('getServerId without broker token should throw an error', async () => {
    const expectedError = new Error(
      'BROKER_TOKEN is required to successfully identify itself to the server',
    );
    expectedError.name = 'MISSING_BROKER_TOKEN';

    try {
      await getServerId({}, '', 'random-client-id');
    } catch (error) {
      expect(error).toStrictEqual(expectedError);
    }
  });
  it('getServerId valid request dispatcher request', async () => {
    try {
      const serverId = await getServerId(
        {
          API_BASE_URL: serverUrl,
          BROKER_TOKEN: 'abc',
          BROKER_CLIENT_LOCATION: 'random cluster',
          DISPATCHER_URL_PREFIX: `${serverUrl}/hidden/broker`,
        },
        'abc',
        'random-client-id',
      );
      expect(serverId).toEqual('random cluster');
    } catch (error) {
      expect(error).toBeNull();
    }
  });

  it('getServerId valid request dispatcher request without location', async () => {
    try {
      const serverId = await getServerId(
        {
          API_BASE_URL: serverUrl,
          BROKER_TOKEN: 'abc',
          DISPATCHER_URL_PREFIX: `${serverUrl}/hidden/broker`,
        },
        'abc',
        'random-client-id',
      );
      expect(serverId).toEqual('snyk-broker-client');
    } catch (error) {
      expect(error).toBeNull();
    }
  });
});
