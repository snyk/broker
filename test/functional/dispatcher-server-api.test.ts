import { hashToken } from '../../lib/hybrid-sdk/common/utils/token';

const PORT = 9999;
process.env.BROKER_SERVER_URL = `http://localhost:${PORT}`;
const nock = require('nock');

describe('Broker Server Dispatcher API interaction', () => {
  const apiVersion = '2022-12-02%7Eexperimental';
  // Obviously-fake fixtures so secret scanners don't flag this file. The hash is
  // derived the same way the dispatcher does, so no sha256 literal is committed.
  const token = 'broker-test-token';
  const hashedToken = hashToken(token);
  const clientId = '00000000-0000-0000-0000-000000000001';
  const clientVersion = '4.144.1';
  const podName = 'broker-server-3-0';

  const gatewayUrl = 'http://broker-gateway-dispatcher';
  // The legacy node dispatcher. Only written to when DISPATCHER_URL is set.
  const nodeUrl = 'http://broker-server-dispatcher';

  const connectionPath = (requestType: string, extra = '') =>
    `/internal/brokerservers/${podName}/connections/${hashedToken}?broker_client_id=${clientId}${extra}&request_type=${requestType}&version=${apiVersion}`;

  const expectedBody = {
    data: {
      attributes: {
        broker_client_version: clientVersion,
        health_check_link: `http://${podName}/healthcheck`,
      },
    },
  };

  // Each test re-requires config + dispatcher from a fresh module graph so the
  // module-level dispatcher selection picks up its env.
  const loadDispatcher = async () => {
    jest.resetModules();
    const {
      loadBrokerConfig,
    } = require('../../lib/hybrid-sdk/common/config/config');
    await loadBrokerConfig();
    return require('../../lib/hybrid-sdk/server/infra/dispatcher');
  };

  const nodeCalls = jest.fn();

  beforeEach(() => {
    nock.cleanAll();
    process.env.hostname = podName;
    process.env.GATEWAY_DISPATCHER_URL = gatewayUrl;
    delete process.env.DISPATCHER_URL;
    nodeCalls.mockReset();
    nock(nodeUrl)
      .persist()
      .post(/.*/)
      .reply(() => {
        nodeCalls();
        return [200, 'OK'];
      })
      .delete(/.*/)
      .reply(() => {
        nodeCalls();
        return [200, 'OK'];
      });
  });

  afterEach(async () => {
    nock.cleanAll();
    delete process.env.DISPATCHER_URL;
    delete process.env.GATEWAY_DISPATCHER_URL;
  });

  afterAll(() => {
    delete process.env.BROKER_SERVER_URL;
  });

  it('registers clientConnected with the gateway using the full pod name', async () => {
    const spyGateway = jest.fn();
    nock(gatewayUrl)
      .post(connectionPath('client-connected'))
      .reply((_uri, body) => {
        spyGateway(JSON.parse(body as string));
        return [201, 'Created'];
      });

    const dispatcher = await loadDispatcher();
    await expect(
      dispatcher.clientConnected(token, clientId, clientVersion),
    ).resolves.not.toThrowError();

    expect(spyGateway).toBeCalledTimes(1);
    expect(spyGateway).toBeCalledWith(expectedBody);
  });

  it('sends clientPinged to the gateway with latency', async () => {
    const spyGateway = jest.fn();
    nock(gatewayUrl)
      .post(/\/connections\/.*request_type=client-pinged/)
      .reply((uri, body) => {
        spyGateway(uri, JSON.parse(body as string));
        return [201, 'Created'];
      });

    const dispatcher = await loadDispatcher();
    await dispatcher.clientPinged(
      token,
      clientId,
      clientVersion,
      Date.now() - 5,
    );

    expect(spyGateway).toBeCalledTimes(1);
    const [uri, body] = spyGateway.mock.calls[0];
    expect(uri).toContain(`/internal/brokerservers/${podName}/connections/`);
    expect(uri).toMatch(/latency=\d+/);
    expect(body).toEqual(expectedBody);
  });

  it('sends clientDisconnected to the gateway', async () => {
    const scope = nock(gatewayUrl)
      .delete(
        `/internal/brokerservers/${podName}/connections/${hashedToken}?broker_client_id=${clientId}&version=${apiVersion}`,
      )
      .reply(200);

    const dispatcher = await loadDispatcher();
    await dispatcher.clientDisconnected(token, clientId);

    expect(scope.isDone()).toBe(true);
  });

  it('registers the server with the gateway on serverStarting', async () => {
    const spyGateway = jest.fn();
    nock(gatewayUrl)
      .post(`/internal/brokerservers/${podName}?version=${apiVersion}`)
      .reply((_uri, body) => {
        spyGateway(JSON.parse(body as string));
        return [201, 'Created'];
      });

    const dispatcher = await loadDispatcher();
    await dispatcher.serverStarting();

    expect(spyGateway).toBeCalledWith({
      data: {
        attributes: { health_check_link: `http://${podName}/healthcheck` },
      },
    });
  });

  it('de-registers from the gateway and then invokes the shutdown callback on serverStopping', async () => {
    const shutdownCallback = jest.fn();
    const scope = nock(gatewayUrl)
      .delete(`/internal/brokerservers/${podName}?version=${apiVersion}`)
      .reply(200);

    const dispatcher = await loadDispatcher();
    await expect(
      dispatcher.serverStopping(shutdownCallback),
    ).resolves.not.toThrowError();

    // The de-registration must actually be sent; the no-op fallback would also
    // invoke the callback, so the callback alone proves nothing.
    expect(scope.isDone()).toBe(true);
    // Regression guard: the callback used to be passed into #makeRequest's
    // requestBody slot instead of the cb slot, so it never ran and the process
    // never exited on SIGTERM.
    expect(shutdownCallback).toHaveBeenCalledTimes(1);
  });

  it('still invokes the shutdown callback when the gateway errors', async () => {
    const shutdownCallback = jest.fn();
    nock(gatewayUrl)
      .persist()
      .delete(`/internal/brokerservers/${podName}?version=${apiVersion}`)
      .reply(500, 'NOK');

    const dispatcher = await loadDispatcher();
    await expect(
      dispatcher.serverStopping(shutdownCallback),
    ).resolves.not.toThrowError();

    // Shutdown must not hang on a failing de-register: the cb still fires.
    expect(shutdownCallback).toHaveBeenCalledTimes(1);
  });

  it('swallows gateway errors on clientConnected and records a failed write', async () => {
    nock(gatewayUrl)
      .persist()
      .post(connectionPath('client-connected'))
      .reply(500, 'NOK');

    const dispatcher = await loadDispatcher();
    // Read the counter from the same fresh module graph the dispatcher loaded.
    const { register } = require('prom-client');
    await expect(
      dispatcher.clientConnected(token, clientId, clientVersion),
    ).resolves.not.toThrowError();

    const metric = await register
      .getSingleMetric('broker_dispatcher_write_total')
      .get();
    const failures = metric.values.find(
      (v) =>
        v.labels.target === 'envoy-dispatcher' && v.labels.result === 'failure',
    );
    expect(failures?.value).toEqual(1);
    expect(
      metric.values.some((v) => v.labels.target === 'node-dispatcher'),
    ).toBe(false);
  });

  it('does not write to the node dispatcher when only GATEWAY_DISPATCHER_URL is set', async () => {
    nock(gatewayUrl)
      .post(connectionPath('client-connected'))
      .reply(201, 'Created');

    const dispatcher = await loadDispatcher();
    await dispatcher.clientConnected(token, clientId, clientVersion);

    expect(nodeCalls).not.toHaveBeenCalled();
  });

  describe('when DISPATCHER_URL is set (legacy node dispatcher, e.g. FedRAMP)', () => {
    // The node dispatcher registers the bare pod ordinal, not the full pod name.
    const nodeServerId = '0';
    const nodeConnectionPath = (requestType: string) =>
      `/internal/brokerservers/${nodeServerId}/connections/${hashedToken}?broker_client_id=${clientId}&request_type=${requestType}&version=${apiVersion}`;

    const gatewayCalls = jest.fn();

    beforeEach(() => {
      process.env.DISPATCHER_URL = nodeUrl;
      // The persistent catch-all from the outer beforeEach would swallow the
      // specific interceptors below, so start from a clean slate.
      nock.cleanAll();
      gatewayCalls.mockReset();
      nock(gatewayUrl)
        .persist()
        .post(/.*/)
        .reply(() => {
          gatewayCalls();
          return [200, 'OK'];
        })
        .delete(/.*/)
        .reply(() => {
          gatewayCalls();
          return [200, 'OK'];
        });
    });

    afterEach(() => {
      // No dual write: the gateway must never be touched on this path, even
      // though GATEWAY_DISPATCHER_URL is also set.
      expect(gatewayCalls).not.toHaveBeenCalled();
    });

    it('registers clientConnected with the node dispatcher using the pod ordinal', async () => {
      const spyNode = jest.fn();
      nock(nodeUrl)
        .post(nodeConnectionPath('client-connected'))
        .reply((_uri, body) => {
          spyNode(JSON.parse(body as string));
          return [201, 'Created'];
        });

      const dispatcher = await loadDispatcher();
      await dispatcher.clientConnected(token, clientId, clientVersion);

      expect(spyNode).toBeCalledTimes(1);
      expect(spyNode).toBeCalledWith(expectedBody);
    });

    it('registers and de-registers the server with the node dispatcher', async () => {
      const shutdownCallback = jest.fn();
      const scope = nock(nodeUrl)
        .post(`/internal/brokerservers/${nodeServerId}?version=${apiVersion}`)
        .reply(201)
        .delete(`/internal/brokerservers/${nodeServerId}?version=${apiVersion}`)
        .reply(200);

      const dispatcher = await loadDispatcher();
      await dispatcher.serverStarting();
      await dispatcher.serverStopping(shutdownCallback);

      expect(scope.isDone()).toBe(true);
      expect(shutdownCallback).toHaveBeenCalledTimes(1);
    });

    it('records node dispatcher writes under the node-dispatcher target', async () => {
      nock(nodeUrl)
        .post(nodeConnectionPath('client-connected'))
        .reply(201, 'Created');

      const dispatcher = await loadDispatcher();
      const { register } = require('prom-client');
      await dispatcher.clientConnected(token, clientId, clientVersion);

      const metric = await register
        .getSingleMetric('broker_dispatcher_write_total')
        .get();
      const successes = metric.values.find(
        (v) =>
          v.labels.target === 'node-dispatcher' &&
          v.labels.result === 'success',
      );
      expect(successes?.value).toEqual(1);
      expect(
        metric.values.some((v) => v.labels.target === 'envoy-dispatcher'),
      ).toBe(false);
    });
  });

  it('falls back to no-op functions when neither dispatcher URL is set', async () => {
    delete process.env.GATEWAY_DISPATCHER_URL;
    const shutdownCallback = jest.fn();
    const gatewayScope = nock(gatewayUrl)
      .persist()
      .post(/.*/)
      .reply(200)
      .delete(/.*/)
      .reply(200);

    const dispatcher = await loadDispatcher();
    await expect(
      dispatcher.clientConnected(token, clientId, clientVersion),
    ).resolves.not.toThrowError();
    await dispatcher.serverStopping(shutdownCallback);

    expect(gatewayScope.isDone()).toBe(false);
    expect(nodeCalls).not.toHaveBeenCalled();
    expect(shutdownCallback).toHaveBeenCalledTimes(1);
  });
});
