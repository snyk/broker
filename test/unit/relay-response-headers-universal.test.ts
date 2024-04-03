const PORT = 8001;
process.env.BROKER_SERVER_URL = `http://localhost:${PORT}`;
jest.mock('../../lib/common/http/request');
import { Role, WebSocketConnection } from '../../lib/client/types/client';
import { makeRequestToDownstream } from '../../lib/common/http/request';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const mockedFn = makeRequestToDownstream.mockImplementation((data) => {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  return data;
});

import { forwardWebSocketRequest as relay } from '../../lib/common/relay/forwardWebsocketRequest';
import {
  LoadedClientOpts,
  LoadedServerOpts,
} from '../../lib/common/types/options';

const dummyWebsocketHandler: WebSocketConnection = {
  destroy: () => {
    return;
  },
  latency: 0,
  options: {
    ping: 0,
    pong: 0,
    queueSize: Infinity,
    reconnect: '',
    stategy: '',
    timeout: 100,
    transport: '',
  },
  send: () => {},
  serverId: '0',
  socket: {},
  supportedIntegrationType: 'github',
  transport: '',
  url: '',
  on: () => {},
  end: () => {},
  role: Role.primary,
  open: () => {},
  emit: () => {},
  readyState: 3,
};

const dummyLoadedFilters = {
  private: () => {
    return { url: '/', auth: '', stream: true };
  },
  public: () => {
    return { url: '/', auth: '', stream: true };
  },
};

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
      universalBrokerEnabled: true,
      connections: {
        myconn: {
          identifier: brokerToken,
          SECRET_TOKEN: 'very-secret',
          VALUE: 'some-special-value',
        },
      },
    };
    const options: LoadedClientOpts | LoadedServerOpts = {
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
      loadedFilters: dummyLoadedFilters,
    };
    const route = relay(options, dummyWebsocketHandler)(brokerToken);

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
        const arg = mockedFn.mock.calls[0][0];
        expect(arg.headers['private-token']).toEqual(
          `Bearer ${config.connections.myconn.SECRET_TOKEN}`,
        );
        expect(arg.headers.replaceme).toEqual(
          `replace ${config.connections.myconn.VALUE}`,
        );
        expect(arg.headers.donttouch).toEqual('not to be changed ${VALUE}');
        done();
      },
    );
  });

  it('does NOT swap header values found in BROKER_VAR_SUB', (done) => {
    expect.hasAssertions();

    const brokerToken = 'test-broker';

    const config = {
      universalBrokerEnabled: true,
      connections: {
        myconn: {
          identifier: brokerToken,
          SECRET_TOKEN: 'very-secret',
          VALUE: 'some-special-value',
        },
      },
      disableHeaderVarsSubstitution: true,
      brokerServerUrl: 'http://localhost:8001',
    };

    const options: LoadedClientOpts | LoadedServerOpts = {
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
      loadedFilters: dummyLoadedFilters,
    };
    const route = relay(options, dummyWebsocketHandler)(brokerToken);

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
        const arg = mockedFn.mock.calls[0][0];
        expect(arg.headers['private-token']).toEqual('Bearer ${SECRET_TOKEN}');
        expect(arg.headers.replaceme).toEqual('replace ${VALUE}');
        expect(arg.headers.donttouch).toEqual('not to be changed ${VALUE}');
        done();
      },
    );
  });
});
