jest.mock('request');
import request from 'request';

const requestDefaultsMock = jest.mocked(request.defaults, true);
const requestMock = jest.fn((req, fn) => {
  fn!(null, { statusCode: 200 } as any, {});
});

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
// eslint-disable-next-line @typescript-eslint/no-unused-vars
requestDefaultsMock.mockImplementation((_options) => {
  return requestMock;
});

import { forwardWebSocketRequest as relay } from '../../lib/common/relay/forwardWebsocketRequest';
import { ClientOpts } from '../../lib/client/types/client';
import { ServerOpts } from '../../lib/server/types/http';

describe('header relay', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('swaps header values found in BROKER_VAR_SUB', (done) => {
    expect.hasAssertions();

    const brokerToken = 'test-broker';

    const config = {
      SECRET_TOKEN: 'very-secret',
      VALUE: 'some-special-value',
    };
    const options: ClientOpts | ServerOpts = {
      filters: {
        private: [
          {
            method: 'any',
            url: '/*',
          },
        ],
        public: [],
      },
      config,
      port: 8001,
    };
    const route = relay(options)(brokerToken);

    const headers = {
      'x-broker-var-sub': 'private-token,replaceme',
      donttouch: 'not to be changed ${VALUE}',
      'private-token': 'Bearer ${SECRET_TOKEN}',
      replaceme: 'replace ${VALUE}',
    };

    route(
      {
        url: '/',
        method: 'GET',
        headers: headers,
      },
      () => {
        expect(requestMock).toHaveBeenCalledTimes(1);
        const arg = requestMock.mock.calls[0][0];
        expect(arg.headers!['private-token']).toEqual(
          `Bearer ${config.SECRET_TOKEN}`,
        );
        expect(arg.headers!.replaceme).toEqual(`replace ${config.VALUE}`);
        expect(arg.headers!.donttouch).toEqual('not to be changed ${VALUE}');
        done();
      },
    );
  });

  it('does NOT swap header values found in BROKER_VAR_SUB', (done) => {
    expect.hasAssertions();

    const brokerToken = 'test-broker';

    const config = {
      SECRET_TOKEN: 'very-secret',
      VALUE: 'some-special-value',
      disableHeaderVarsSubstitution: true,
    };

    const options: ClientOpts | ServerOpts = {
      filters: {
        private: [
          {
            method: 'any',
            url: '/*',
          },
        ],
        public: [],
      },
      config,
      port: 8001,
    };
    const route = relay(options)(brokerToken);

    const headers = {
      'x-broker-var-sub': 'private-token,replaceme',
      donttouch: 'not to be changed ${VALUE}',
      'private-token': 'Bearer ${SECRET_TOKEN}',
      replaceme: 'replace ${VALUE}',
    };

    route(
      {
        url: '/',
        method: 'GET',
        headers: headers,
      },
      () => {
        expect(requestMock).toHaveBeenCalledTimes(1);
        const arg = requestMock.mock.calls[0][0];
        expect(arg.headers!['private-token']).toEqual('Bearer ${SECRET_TOKEN}');
        expect(arg.headers!.replaceme).toEqual('replace ${VALUE}');
        expect(arg.headers!.donttouch).toEqual('not to be changed ${VALUE}');
        done();
      },
    );
  });
});
