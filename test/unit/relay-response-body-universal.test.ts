const PORT = 8001;
process.env.BROKER_SERVER_URL = `http://localhost:${PORT}`;

import { Role, WebSocketConnection } from '../../lib/client/types/client';
import { loadBrokerConfig } from '../../lib/common/config/config';
import { loadAllFilters } from '../../lib/common/filter/filtersAsync';
const nock = require('nock');

import { forwardWebSocketRequest as relay } from '../../lib/common/relay/forwardWebsocketRequest';
import {
  CONFIGURATION,
  LoadedClientOpts,
  LoadedServerOpts,
} from '../../lib/common/types/options';
import { setFilterConfig } from '../../lib/client/config/filters';

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
      origin: 'http://test',
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
  beforeAll(() => {
    nock(`http://test`)
      .persist()
      .post(/./)
      .reply((_url, body) => {
        const response = body;
        return [200, response];
      });
  });
  beforeEach(() => {
    // jest.clearAllMocks();
  });

  afterAll(() => {
    delete process.env.BROKER_SERVER_URL;
    // jest.clearAllMocks();
  });

  it('relay swaps body values found in BROKER_VAR_SUB', async () => {
    expect.hasAssertions();

    const brokerToken = 'test-broker';

    const config: CONFIGURATION = {
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
      supportedBrokerTypes: [],
      filterRulesPaths: {},
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
    setFilterConfig({
      loadedFilters: loadAllFilters(dummyLoadedFilters, config),
    });
    const route = relay(options, dummyWebsocketHandler)(brokerToken);

    const body = {
      BROKER_VAR_SUB: ['url'],
      url: '${HOST}:${PORT}/webhook',
    };
    let response;
    await route(
      {
        url: '/',
        method: 'POST',

        body: Buffer.from(JSON.stringify(body)),
        headers: {},
      },
      (responseCallback) => {
        response = responseCallback;
      },
    );
    expect(response).toBeDefined();
    expect(response.status).toEqual(200);
    expect(JSON.parse(response.body).url).toEqual(
      `http://${config.connections.myconn.HOST2}:${config.connections.myconn.PORT}/webhook`,
    );
  });

  it('relay does NOT swaps body values found in BROKER_VAR_SUB if disable substition true', async () => {
    expect.hasAssertions();

    const brokerToken = 'test-broker';

    const config: CONFIGURATION = {
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
      supportedBrokerTypes: [],
      filterRulesPaths: {},
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
    let response;
    await route(
      {
        url: '/',
        method: 'POST',

        body: Buffer.from(JSON.stringify(body)),
        headers: {},
      },
      (responseCallback) => {
        response = responseCallback;
      },
    );
    expect(response).toBeDefined();
    expect(response.status).toEqual(200);
    expect(JSON.parse(response.body).url).toEqual('${HOST}:${PORT}/webhook');
  });
});
