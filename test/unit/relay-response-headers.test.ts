const PORT = 8001;
process.env.BROKER_SERVER_URL = `http://localhost:${PORT}`;
jest.mock('../../lib/common/http/request');
import { makeRequestToDownstream } from '../../lib/common/http/request';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const mockedFn = makeRequestToDownstream.mockImplementation((data) => {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  resolve(data);
});

import { forwardWebSocketRequest as relay } from '../../lib/common/relay/forwardWebsocketRequest';
import { ClientOpts } from '../../lib/client/types/client';
import { ServerOpts } from '../../lib/server/types/http';

describe('header relay', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  afterAll(() => {
    delete process.env.BROKER_SERVER_URL;
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
        expect(makeRequestToDownstream).toHaveBeenCalledTimes(1);
        const arg = mockedFn.mock.calls[0][1];

        expect(arg['private-token']).toEqual(`Bearer ${config.SECRET_TOKEN}`);
        expect(arg.replaceme).toEqual(`replace ${config.VALUE}`);
        expect(arg.donttouch).toEqual('not to be changed ${VALUE}');
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
      brokerServerUrl: 'http://localhost:8001',
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
        expect(makeRequestToDownstream).toHaveBeenCalledTimes(1);
        const arg = mockedFn.mock.calls[0][1];
        expect(arg['private-token']).toEqual('Bearer ${SECRET_TOKEN}');
        expect(arg.replaceme).toEqual('replace ${VALUE}');
        expect(arg.donttouch).toEqual('not to be changed ${VALUE}');
        done();
      },
    );
  });
});
