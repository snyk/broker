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

describe('body relay', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    delete process.env.BROKER_SERVER_URL;
    jest.clearAllMocks();
  });

  it('relay swaps body values found in BROKER_VAR_SUB with application/x-www-form-urlencoded content-type', (done) => {
    expect.hasAssertions();

    const brokerToken = 'test-broker';

    const config = {
      HOST: 'localhost',
      PORT: '8001',
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
        headers,
      },
      () => {
        expect(makeRequestToDownstream).toHaveBeenCalledTimes(1);
        const arg = mockedFn.mock.calls[0][0];
        expect(arg.body).toEqual(
          `url=${config.HOST}%3A${config.PORT}%2Fwebhook`,
        );

        done();
      },
    );
  });

  it('relay swaps body values found in BROKER_VAR_SUB with JSON type', (done) => {
    expect.hasAssertions();

    const brokerToken = 'test-broker';

    const config = {
      HOST: 'localhost',
      PORT: '8001',
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
        expect(JSON.parse(arg.body).url).toEqual(
          `${config.HOST}:${config.PORT}/webhook`,
        );

        done();
      },
    );
  });

  it('relay does NOT swap body values found in BROKER_VAR_SUB if disabled with json type', (done) => {
    expect.hasAssertions();

    const brokerToken = 'test-broker';

    const config = {
      HOST: 'localhost',
      PORT: '8001',
      disableBodyVarsSubstitution: true,
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

  it('relay does NOT swap body values found in BROKER_VAR_SUB if disabled  with application/x-www-form-urlencoded content-type', (done) => {
    expect.hasAssertions();

    const brokerToken = 'test-broker';

    const config = {
      HOST: 'localhost',
      PORT: '8001',
      disableBodyVarsSubstitution: true,
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
        headers,
      },
      () => {
        expect(makeRequestToDownstream).toHaveBeenCalledTimes(1);
        const arg = mockedFn.mock.calls[0][0];
        expect(arg.body).toEqual(
          'BROKER_VAR_SUB=url&url=%24%7BHOST%7D%3A%24%7BPORT%7D%2Fwebhook',
        );

        done();
      },
    );
  });
});
