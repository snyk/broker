import { loadBrokerConfig } from '../../lib/hybrid-sdk/common/config/config';

const PORT = 9999;
process.env.BROKER_SERVER_URL = `http://localhost:${PORT}`;
const nock = require('nock');

describe('Broker Server Dispatcher API interaction', () => {
  const apiVersion = '2022-12-02%7Eexperimental';
  // token hashed with 256-sha algorithm
  const token =
    '3c469e9d6c5875d37a43f353d4f88e61fcf812c66eee3457465a40b0da4153e0';
  const hashedToken =
    'db37d21181592000efad06f87a00afba59f9c99b11e119d118be2b929c3387ce';
  const clientId = '40365f1c-8c8f-45d4-8311-788058652c4d';
  const clientVersion = '4.144.1';

  const serverUrl = 'http://broker-server-dispatcher';

  const spyLogWarn = jest
    .spyOn(require('bunyan').prototype, 'warn')
    .mockImplementation((value) => {
      return value;
    });
  const spyLogError = jest
    .spyOn(require('bunyan').prototype, 'error')
    .mockImplementation((value) => {
      return value;
    });
  const spyFn = jest.fn();
  afterAll(() => {
    spyLogWarn.mockReset();
    spyLogError.mockReset();
    delete process.env.BROKER_SERVER_URL;
  });
  beforeAll(() => {
    const PORT = 9999;
    process.env.BROKER_SERVER_URL = `http://localhost:${PORT}`;
  });
  beforeEach(() => {
    spyFn.mockReset();
    spyLogWarn.mockReset();
    spyLogError.mockReset();
  });

  it('should fire off clientConnected call successfully with server response', async () => {
    nock(`${serverUrl}`)
      .post(
        `/internal/brokerservers/0/connections/${hashedToken}?broker_client_id=${clientId}&request_type=client-connected&version=${apiVersion}`,
      )
      .reply((uri, requestBody) => {
        spyFn(JSON.parse(requestBody));
        return [200, 'OK'];
      });

    try {
      process.env.DISPATCHER_URL = `${serverUrl}`;
      process.env.hostname = '0';
      await loadBrokerConfig();
      const dispatcher = require('../../lib/hybrid-sdk/server/infra/dispatcher');
      await expect(
        dispatcher.clientConnected(token, clientId, clientVersion),
      ).resolves.not.toThrowError();
      expect(spyLogWarn).toHaveBeenCalledTimes(0);
      expect(spyFn).toBeCalledWith({
        data: {
          attributes: {
            broker_client_version: '4.144.1',
            health_check_link: 'http://0/healthcheck',
          },
        },
      });
    } catch (err) {
      expect(err).toBeNull();
    }
  });

  it.skip('should fire off clientPinged call successfully with server response', async () => {
    const time = Date.now();
    const fakeLatency = 1;
    nock(`${serverUrl}`)
      .post(
        `/internal/brokerservers/0/connections/${hashedToken}?broker_client_id=${clientId}&request_type=client-pinged&latency=${fakeLatency}&version=${apiVersion}`,
      )
      .reply((uri, requestBody) => {
        spyFn(JSON.parse(requestBody));
        return [200, 'OK'];
      });

    process.env.DISPATCHER_URL = `${serverUrl}`;
    process.env.hostname = '0';
    await loadBrokerConfig();
    const dispatcher = require('../../lib/dispatcher');
    await expect(
      dispatcher.clientPinged(
        token,
        clientId,
        clientVersion,
        time - fakeLatency,
      ),
    ).resolves.not.toThrowError();
    expect(spyLogWarn).toHaveBeenCalledTimes(0);
    expect(spyFn).toBeCalledWith({
      data: {
        attributes: {
          broker_client_version: '4.144.1',
          health_check_link: 'http://0/healthcheck',
        },
      },
    });
  });

  it('should fire off clientConnected call successfully with warnings', async () => {
    nock(`${serverUrl}`)
      .post(
        `/internal/brokerservers/0/connections/${hashedToken}?broker_client_id=${clientId}&request_type=client-connected&version=${apiVersion}`,
      )
      .reply((uri, requestBody) => {
        spyFn(JSON.parse(requestBody));
        return [500, 'NOK'];
      })
      .persist();

    try {
      process.env.DISPATCHER_URL = `${serverUrl}`;
      process.env.hostname = '0';
      const dispatcher = require('../../lib/hybrid-sdk/server/infra/dispatcher');
      await expect(
        dispatcher.clientConnected(token, clientId, clientVersion),
      ).resolves.not.toThrowError();
      expect(spyLogWarn).toHaveBeenCalledTimes(1);

      const output = spyLogWarn.mock.calls[0][0] as Object;
      expect(output['errorMessage']).toEqual(
        'Request failed with status code 500',
      );
      expect(output['retryCount']).toEqual(3);

      expect(spyLogError).toBeCalledTimes(1);
      const errorOutput = spyLogError.mock.calls[0][0] as Object;
      expect(errorOutput['errorMessage']).toEqual(
        'Request failed with status code 500',
      );
      expect(errorOutput['requestType']).toEqual('client-connected');
    } catch (err) {
      expect(err).toBeNull();
    }
  });
});

describe('Broker Server Dispatcher dual-write to gateway', () => {
  const apiVersion = '2022-12-02%7Eexperimental';
  const token =
    '3c469e9d6c5875d37a43f353d4f88e61fcf812c66eee3457465a40b0da4153e0';
  const hashedToken =
    'db37d21181592000efad06f87a00afba59f9c99b11e119d118be2b929c3387ce';
  const clientId = '40365f1c-8c8f-45d4-8311-788058652c4d';
  const clientVersion = '4.144.1';
  const primaryUrl = 'http://broker-server-dispatcher';
  const gatewayUrl = 'http://broker-gateway-dispatcher';

  const expectedBody = {
    data: {
      attributes: {
        broker_client_version: clientVersion,
        health_check_link: 'http://0/healthcheck',
      },
    },
  };

  const connectionPath = `/internal/brokerservers/0/connections/${hashedToken}?broker_client_id=${clientId}&request_type=client-connected&version=${apiVersion}`;

  // Each test re-requires config + dispatcher from a fresh module graph so the
  // module-level `if (config.dispatcherUrl)` wiring picks up that test's env.
  const loadDispatcher = async () => {
    jest.resetModules();
    const {
      loadBrokerConfig,
    } = require('../../lib/hybrid-sdk/common/config/config');
    await loadBrokerConfig();
    return require('../../lib/hybrid-sdk/server/infra/dispatcher');
  };

  beforeEach(() => {
    nock.cleanAll();
    process.env.hostname = '0';
  });

  afterEach(() => {
    nock.cleanAll();
    delete process.env.DISPATCHER_URL;
    delete process.env.GATEWAY_DISPATCHER_URL;
  });

  it('mirrors clientConnected to both the primary and the gateway dispatcher', async () => {
    const spyPrimary = jest.fn();
    const spyGateway = jest.fn();
    // The mirror is fire-and-forget, so clientConnected resolves on the primary
    // alone. Await this to deterministically observe the gateway write landing.
    let resolveGatewayWritten;
    const gatewayWritten = new Promise<void>((resolve) => {
      resolveGatewayWritten = resolve;
    });

    nock(primaryUrl)
      .post(connectionPath)
      .reply((_uri, body) => {
        spyPrimary(JSON.parse(body as string));
        return [200, 'OK'];
      });
    nock(gatewayUrl)
      .post(connectionPath)
      .reply((_uri, body) => {
        spyGateway(JSON.parse(body as string));
        resolveGatewayWritten();
        return [201, 'Created'];
      });

    process.env.DISPATCHER_URL = primaryUrl;
    process.env.GATEWAY_DISPATCHER_URL = gatewayUrl;
    const dispatcher = await loadDispatcher();

    await expect(
      dispatcher.clientConnected(token, clientId, clientVersion),
    ).resolves.not.toThrowError();
    await gatewayWritten;

    expect(spyPrimary).toBeCalledWith(expectedBody);
    expect(spyGateway).toBeCalledWith(expectedBody);
  });

  it('does not write to the gateway when GATEWAY_DISPATCHER_URL is unset', async () => {
    const spyPrimary = jest.fn();

    nock(primaryUrl)
      .post(connectionPath)
      .reply((_uri, body) => {
        spyPrimary(JSON.parse(body as string));
        return [200, 'OK'];
      });
    // Any contact with the gateway host would consume this interceptor.
    const gatewayScope = nock(gatewayUrl).post(/.*/).reply(200);

    process.env.DISPATCHER_URL = primaryUrl;
    delete process.env.GATEWAY_DISPATCHER_URL;
    const dispatcher = await loadDispatcher();

    await expect(
      dispatcher.clientConnected(token, clientId, clientVersion),
    ).resolves.not.toThrowError();

    expect(spyPrimary).toBeCalledTimes(1);
    expect(gatewayScope.isDone()).toBe(false);
  });

  it('isolates the primary write path from an unhealthy gateway', async () => {
    const spyPrimary = jest.fn();
    let gatewayAttempts = 0;
    let resolveFirstAttempt;
    const firstGatewayAttempt = new Promise<void>((resolve) => {
      resolveFirstAttempt = resolve;
    });

    nock(primaryUrl)
      .post(connectionPath)
      .reply((_uri, body) => {
        spyPrimary(JSON.parse(body as string));
        return [200, 'OK'];
      });
    // Unhealthy gateway: every attempt (and axios-retry's retries) 500s.
    // persist() keeps the failures inside nock so the background retry budget
    // (~1.4s for 5xx, up to ~11s if it were black-holing) never touches the
    // real network.
    nock(gatewayUrl)
      .persist()
      .post(connectionPath)
      .reply(() => {
        gatewayAttempts += 1;
        resolveFirstAttempt();
        return [500, 'Internal Server Error'];
      });

    process.env.DISPATCHER_URL = primaryUrl;
    process.env.GATEWAY_DISPATCHER_URL = gatewayUrl;
    const dispatcher = await loadDispatcher();

    const start = Date.now();
    await expect(
      dispatcher.clientConnected(token, clientId, clientVersion),
    ).resolves.not.toThrowError();
    const elapsed = Date.now() - start;

    // Primary write landed exactly once and was unaffected by the failing mirror.
    expect(spyPrimary).toBeCalledTimes(1);
    expect(spyPrimary).toBeCalledWith(expectedBody);
    // The call returned on the primary alone, without waiting on the gateway's
    // retry budget — this is the latency isolation fire-and-forget guarantees.
    expect(elapsed).toBeLessThan(500);

    // The mirror was genuinely attempted (fire-and-forget) and is harmless on
    // failure. Drain the background retries inside nock before teardown.
    await firstGatewayAttempt;
    expect(gatewayAttempts).toBeGreaterThan(0);
    await new Promise((resolve) => setTimeout(resolve, 1600));
  });
});
