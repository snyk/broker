const PORT = 8001;
process.env.BROKER_SERVER_URL = `http://localhost:${PORT}`;

jest.mock('../../lib/hybrid-sdk/http/request');
import {
  Role,
  WebSocketConnection,
} from '../../lib/hybrid-sdk/client/types/client';
import { makeRequestToDownstream } from '../../lib/hybrid-sdk/http/request';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const mockedFn = makeRequestToDownstream.mockImplementation((data) => {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  return data;
});

import { forwardWebSocketRequest as relay } from '../../lib/hybrid-sdk/common/connectionToWorkloadInterface/forwardWebsocketRequest';
import {
  CONFIGURATION,
  LoadedClientOpts,
  LoadedServerOpts,
} from '../../lib/hybrid-sdk/common/types/options';
import { AuthObject } from '../../lib/hybrid-sdk/common/types/filter';

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

const dummyAuthObject: AuthObject = {
  scheme: '',
};

const dummyLoadedFilters = {
  private: () => {
    return { method: 'GET', url: '/', auth: dummyAuthObject };
  },
  public: () => {
    return { method: 'GET', url: '/', auth: dummyAuthObject };
  },
};

describe('body relay', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    delete process.env.BROKER_SERVER_URL;
    jest.clearAllMocks();
  });

  it('relay swaps body values found in BROKER_VAR_SUB application/x-www-form-urlencoded type', (done) => {
    expect.hasAssertions();

    const brokerToken = 'test-broker';

    const config: CONFIGURATION = {
      remoteWorkloadName: 'BrokerWorkload',
      remoteWorkloadModulePath: '../broker-workload/websocketRequests',
      clientWorkloadName: 'BrokerClientRequestWorkload',
      clientWorkloadModulePath: '../broker-workload/clientLocalRequests',
      universalBrokerEnabled: true,
      plugins: new Map<string, any>(),
      connections: {
        myconn: {
          identifier: brokerToken,
          HOST: 'localhost',
          PORT: '8001',
        },
      },
      supportedBrokerTypes: [],
      filterRulesPaths: {},
      brokerType: 'server',
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

    const body = {
      BROKER_VAR_SUB: ['url'],
      url: '${HOST}:${PORT}/webhook',
    };
    const headers = {
      'x-broker-content-type': 'application/x-www-form-urlencoded',
    };

    route(
      {
        url: '/',
        method: 'POST',
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        body: Buffer.from(JSON.stringify(body)),
        headers: headers,
      },
      () => {
        expect(makeRequestToDownstream).toHaveBeenCalledTimes(1);
        const arg = mockedFn.mock.calls[0][0];

        expect(arg.headers['content-type']).toEqual(
          'application/x-www-form-urlencoded',
        );
        expect(arg.body).toEqual(
          `url=${config.connections.myconn.HOST}%3A${config.connections.myconn.PORT}%2Fwebhook`,
        );

        done();
      },
    );
  });

  it('relay does NOT swap body values found in BROKER_VAR_SUB if disabled', (done) => {
    expect.hasAssertions();

    const brokerToken = 'test-broker';

    const config: CONFIGURATION = {
      remoteWorkloadName: 'BrokerWorkload',
      remoteWorkloadModulePath: '../broker-workload/websocketRequests',
      clientWorkloadName: 'BrokerClientRequestWorkload',
      clientWorkloadModulePath: '../broker-workload/clientLocalRequests',
      universalBrokerEnabled: true,
      plugins: new Map<string, any>(),
      connections: {
        myconn: {
          identifier: brokerToken,
          HOST: 'localhost',
          PORT: '8001',
        },
      },
      disableBodyVarsSubstitution: true,
      brokerServerUrl: 'http://localhost:8001',
      supportedBrokerTypes: [],
      filterRulesPaths: {},
      brokerType: 'server',
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

    const body = {
      BROKER_VAR_SUB: ['url'],
      url: '${HOST}:${PORT}/webhook',
    };

    route(
      {
        url: '/',
        method: 'POST',
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        body: Buffer.from(JSON.stringify(body)),
        headers: {},
      },
      () => {
        expect(makeRequestToDownstream).toHaveBeenCalledTimes(1);
        const arg = mockedFn.mock.calls[0][0];
        expect(JSON.parse(arg.body).url).toEqual('${HOST}:${PORT}/webhook');

        done();
      },
    );
  });

  it('calculate content type after converting request body', (done) => {
    expect.hasAssertions();

    const brokerToken = 'test-broker';

    const config: CONFIGURATION = {
      remoteWorkloadName: 'BrokerWorkload',
      remoteWorkloadModulePath: '../broker-workload/websocketRequests',
      clientWorkloadName: 'BrokerClientRequestWorkload',
      clientWorkloadModulePath: '../broker-workload/clientLocalRequests',
      universalBrokerEnabled: true,
      plugins: new Map<string, any>(),
      connections: {
        myconn: {
          identifier: brokerToken,
          HOST: 'localhost',
          PORT: '8001',
        },
      },
      supportedBrokerTypes: [],
      filterRulesPaths: {},
      brokerType: 'server',
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

    const body = {
      BROKER_VAR_SUB: ['url'],
      url: '${HOST}:${PORT}/webhook',
    };
    const headers = {
      'x-broker-content-type': 'application/x-www-form-urlencoded',
    };

    route(
      {
        url: '/',
        method: 'POST',
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        body: Buffer.from(JSON.stringify(body)),
        headers: headers,
      },
      () => {
        expect(makeRequestToDownstream).toHaveBeenCalledTimes(1);
        const arg = mockedFn.mock.calls[0][0];

        expect(arg.headers['Content-Length']).toEqual(arg.body.length);

        done();
      },
    );
  });
});
