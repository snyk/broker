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

// simulates the result from the loaded filters function
const dummyLoadedFilters = {
  private: () => {
    return {
      url: 'https://test/$INSTALLATION_ID/path/$OTHER',
      auth: '',
      stream: true,
    };
  },
  public: () => {
    return { url: '/', auth: '', stream: true };
  },
};

describe('uri relay', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  afterAll(() => {
    delete process.env.BROKER_SERVER_URL;
    jest.clearAllMocks();
  });
  it('swaps uri placeholder values found in url', (done) => {
    expect.hasAssertions();

    const brokerToken = 'test-broker';

    const config = {
      INSTALLATION_ID: '123',
      OTHER: 'REPLACEDVALUE',
      enableUrlVarsSubstitution: true,
    };
    const options: LoadedClientOpts | LoadedServerOpts = {
      filters: {
        private: [
          {
            method: 'any',
            url: '/*',
            origin: 'https://test',
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
      test: '1',
    };

    route(
      {
        url: '/$INSTALLATION_ID/path/$OTHER',
        method: 'GET',
        headers: headers,
      },
      () => {
        expect(makeRequestToDownstream).toHaveBeenCalledTimes(1);
        const arg = mockedFn.mock.calls[0][0];
        expect(arg.url).toEqual(`https://test/123/path/REPLACEDVALUE`);
        done();
      },
    );
  });

  it('does NOT swaps uri placeholder values found in url if not enabled in config', (done) => {
    expect.hasAssertions();

    const brokerToken = 'test-broker';

    const config = {
      INSTALLATION_ID: '123',
      OTHER: 'REPLACEDVALUE',
    };
    const options: LoadedClientOpts | LoadedServerOpts = {
      filters: {
        private: [
          {
            method: 'any',
            url: '/*',
            origin: 'https://test',
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
      test: '1',
    };

    route(
      {
        url: '/INSTALLATION_ID/path/OTHER',
        method: 'GET',
        headers: headers,
      },
      () => {
        expect(makeRequestToDownstream).toHaveBeenCalledTimes(1);
        const arg = mockedFn.mock.calls[0][0];
        expect(arg.url).toEqual('https://test/$INSTALLATION_ID/path/$OTHER');
        done();
      },
    );
  });
});
