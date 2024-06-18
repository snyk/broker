const PORT = 8001;
process.env.BROKER_SERVER_URL = `http://localhost:${PORT}`;

jest.mock('../../lib/common/relay/requestsHelper');
import { Role, WebSocketConnection } from '../../lib/client/types/client';
import { loadBrokerConfig } from '../../lib/common/config/config';
import { loadAllFilters } from '../../lib/common/filter/filtersAsync';
import { makeLegacyRequest } from '../../lib/common/relay/requestsHelper';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const mockedFn = makeLegacyRequest.mockImplementation((data, emit) => {
  emit();
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
  transport: '',
  url: '',
  on: () => {},
  end: () => {},
  role: Role.primary,
  open: () => {},
  emit: () => {},
  readyState: 3,
  supportedIntegrationType: 'github',
};

const dummyLoadedFilters = new Map();
dummyLoadedFilters['github'] = {
  private: [
    {
      method: 'any',
      url: '/*',
    },
  ],
  public: [
    {
      method: 'any',
      url: '/*',
    },
  ],
};

describe('body relay', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    delete process.env.BROKER_SERVER_URL;
    jest.clearAllMocks();
  });

  it('relay swaps body values found in BROKER_VAR_SUB', () => {
    expect.hasAssertions();

    const brokerToken = 'test-broker';

    const config = {
      universalBrokerEnabled: true,
      plugins: new Map<string, any>(),
      brokerType: 'client',
      connections: {
        myconn: {
          identifier: brokerToken,
          HOST: 'http://$HOST2',
          PORT: '8001',
          HOST2: 'localhost',
          type: 'github',
        },
      },
      brokerClientConfiguration: {
        common: {
          default: {},
          required: {},
        },
        github: { default: {} },
      },
      sourceTypes: {
        github: {
          publicId: '9a3e5d90-b782-468a-a042-9a2073736f0b',
          name: 'GitHub',
          type: 'github',
          brokerType: 'github',
        },
      },
    };
    loadBrokerConfig(config);

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
      loadedFilters: loadAllFilters(dummyLoadedFilters, config),
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
        expect(makeLegacyRequest).toHaveBeenCalledTimes(1);
        const arg = mockedFn.mock.calls[0][0];
        const url = JSON.parse(arg.body).url;
        expect(url).toEqual(
          `http://${config.connections.myconn.HOST2}:${config.connections.myconn.PORT}/webhook`,
        );
      },
    );
  });

  it('relay does NOT swaps body values found in BROKER_VAR_SUB if disable substition true', () => {
    expect.hasAssertions();

    const brokerToken = 'test-broker';

    const config = {
      disableBodyVarsSubstitution: true,
      universalBrokerEnabled: true,
      plugins: new Map<string, any>(),
      brokerType: 'client',
      connections: {
        myconn: {
          identifier: brokerToken,
          HOST: '$HOST2',
          PORT: '8001',
          HOST2: 'localhost',
          type: 'github',
        },
      },
      brokerClientConfiguration: {
        common: {
          default: {},
          required: {},
        },
        github: { default: {} },
      },
      sourceTypes: {
        github: {
          publicId: '9a3e5d90-b782-468a-a042-9a2073736f0b',
          name: 'GitHub',
          type: 'github',
          brokerType: 'github',
        },
      },
    };
    loadBrokerConfig(config);

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
      loadedFilters: loadAllFilters(dummyLoadedFilters, config),
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
        expect(makeLegacyRequest).toHaveBeenCalledTimes(1);
        const arg = mockedFn.mock.calls[0][0];
        const url = JSON.parse(arg.body).url;
        expect(url).toEqual('${HOST}:${PORT}/webhook');
      },
    );
  });
});
