import { loadBrokerConfig } from '../../lib/hybrid-sdk/common/config/config';
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

  it('should invoke the shutdown callback after de-registering on serverStopping', async () => {
    nock(`${serverUrl}`)
      .delete(`/internal/brokerservers/0?version=${apiVersion}`)
      .reply(() => {
        return [200, 'OK'];
      });

    process.env.DISPATCHER_URL = `${serverUrl}`;
    process.env.hostname = '0';
    await loadBrokerConfig();
    const dispatcher = require('../../lib/hybrid-sdk/server/infra/dispatcher');

    await expect(dispatcher.serverStopping(spyFn)).resolves.not.toThrowError();

    // Regression guard: the callback used to be passed into #makeRequest's
    // requestBody slot instead of the cb slot, so it never ran and the process
    // never exited on SIGTERM.
    expect(spyFn).toHaveBeenCalledTimes(1);
  });

  it('should still invoke the shutdown callback when the dispatcher errors', async () => {
    nock(`${serverUrl}`)
      .delete(`/internal/brokerservers/0?version=${apiVersion}`)
      .reply(500, 'NOK')
      .persist();

    process.env.DISPATCHER_URL = `${serverUrl}`;
    process.env.hostname = '0';
    await loadBrokerConfig();
    const dispatcher = require('../../lib/hybrid-sdk/server/infra/dispatcher');

    await expect(dispatcher.serverStopping(spyFn)).resolves.not.toThrowError();

    // Shutdown must not hang on a failing de-register: the cb still fires.
    expect(spyFn).toHaveBeenCalledTimes(1);
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

describe('Broker Server selectable dispatcher', () => {
  const dispatcherUrl = 'http://configured-dispatcher';
  const token = 'token';
  const hashedToken = hashToken(token);
  const clientId = 'client-id';
  const clientVersion = '1.2.3';
  const apiVersion = '2022-12-02~experimental';
  const podName = 'broker-server-3-0';

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
    process.env.hostname = podName;
    process.env.DISPATCHER_URL = dispatcherUrl;
  });

  afterEach(() => {
    nock.cleanAll();
    delete process.env.DISPATCHER_URL;
    delete process.env.USE_GATEWAY_DISPATCHER;
    delete process.env.GATEWAY_DISPATCHER_URL;
    delete process.env.hostname;
  });

  it('uses the full pod name when gateway dispatcher is selected', async () => {
    process.env.USE_GATEWAY_DISPATCHER = 'true';
    const gatewayPath = `/internal/brokerservers/${podName}/connections/${hashedToken}?broker_client_id=${clientId}&request_type=client-connected&version=${apiVersion}`;
    const gatewayScope = nock(dispatcherUrl).post(gatewayPath).reply(201);

    const dispatcher = await loadDispatcher();
    await dispatcher.clientConnected(token, clientId, clientVersion);

    expect(gatewayScope.isDone()).toBe(true);
  });

  it('uses the pod ordinal when legacy dispatcher is selected', async () => {
    process.env.USE_GATEWAY_DISPATCHER = 'false';
    const legacyPath = `/internal/brokerservers/0/connections/${hashedToken}?broker_client_id=${clientId}&request_type=client-connected&version=${apiVersion}`;
    const legacyScope = nock(dispatcherUrl).post(legacyPath).reply(200);

    const dispatcher = await loadDispatcher();
    await dispatcher.clientConnected(token, clientId, clientVersion);

    expect(legacyScope.isDone()).toBe(true);
  });
});
