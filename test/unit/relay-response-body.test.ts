const PORT = 8001;
process.env.BROKER_SERVER_URL = `http://localhost:${PORT}`;

jest.mock('../../lib/hybrid-sdk/http/request');
import { Role } from '../../lib/hybrid-sdk/client/types/client';
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
import { Primus } from 'primus';
import { WebSocketServer } from '../../lib/hybrid-sdk/server/types/socket';

const dummyWebsocketHandler = {
  destroy: () => {
    return;
  },
  options: {
    ping: 0,
    pong: 0,
    queueSize: Infinity,
    reconnect: '',
    stategy: '',
    timeout: 100,
    transport: '',
  },
  authorize: () => {},
  plugin: () => ({} as Primus),
  send: () => {},
  serverId: '0',
  socket: {},
  supportedIntegrationType: 'github',
  transport: '',
  url: new URL('http://localhost:8000'),
  on: () => ({} as Primus),
  end: () => {},
  role: Role.primary,
  open: () => {},
  emit: () => false,
  readyState: 3,
} as unknown as WebSocketServer;

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

  it('relay swaps body values found in BROKER_VAR_SUB', (done) => {
    expect.hasAssertions();

    const brokerToken = 'test-broker';

    const config: CONFIGURATION = {
      remoteWorkloadName: 'BrokerWorkload',
      remoteWorkloadModulePath: '../broker-workload/websocketRequests',
      clientWorkloadName: 'BrokerClientRequestWorkload',
      clientWorkloadModulePath: '../broker-workload/clientLocalRequests',
      HOST: 'localhost',
      PORT: '8001',
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

    const expectedBody = {
      url: `${config.HOST}:${config.PORT}/webhook`,
    };

    const bodyLengthBytes = Buffer.byteLength(
      JSON.stringify(expectedBody),
      'utf8',
    );

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
        expect(JSON.parse(arg.body).url).toEqual(
          `${config.HOST}:${config.PORT}/webhook`,
        );
        expect(arg.headers['Content-Length']).toEqual(bodyLengthBytes);
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
      HOST: 'localhost',
      PORT: '8001',
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

    const bodyLengthBytes = Buffer.byteLength(JSON.stringify(body), 'utf8');

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
        expect(arg.headers['Content-Length']).toEqual(bodyLengthBytes);
        done();
      },
    );
  });

  it('handles characters outside of [a-zA-Z0-9]', (done) => {
    expect.hasAssertions();

    const brokerToken = 'test-broker';

    const config: CONFIGURATION = {
      remoteWorkloadName: 'BrokerWorkload',
      remoteWorkloadModulePath: '../broker-workload/websocketRequests',
      clientWorkloadName: 'BrokerClientRequestWorkload',
      clientWorkloadModulePath: '../broker-workload/clientLocalRequests',
      HOST: 'localhost',
      PORT: '8001',
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
      data: 'data–with–u+2013–dashes',
    };

    const bodyLengthBytes = Buffer.byteLength(JSON.stringify(body), 'utf8');

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
        expect(arg.headers['Content-Length']).toEqual(bodyLengthBytes);
        done();
      },
    );
  });
});
