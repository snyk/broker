import { hashToken } from '../../common/utils/token';
import { log as logger } from '../../../logs/logger';
import { getConfig } from '../../common/config/config';

import { uuidv4 } from '../../common/utils/uuid';
import { axiosInstance } from '../../http/axios';
import { incrementDispatcherWrite } from '../../common/utils/metrics';

class DispatcherClient {
  #url;
  #hostname;
  #id;
  #version;
  #target;

  // `target` labels which dispatcher this client writes to (node-dispatcher or envoy-dispatcher) for the broker_dispatcher_write_total metric.
  constructor(url, hostname, id, version, target) {
    this.#url = url;
    this.#hostname = hostname;
    this.#id = id || 0;
    this.#version = version || '2022-12-02~experimental';
    this.#target = target;
  }

  async serverStarting() {
    await this.#makeRequest(
      { requestType: 'server-starting' },
      `${this.#url}/internal/brokerservers/${this.#id}`,
      'post',
      {
        data: {
          attributes: {
            health_check_link: `http://${this.#hostname}/healthcheck`,
          },
        },
      },
    );
  }

  async serverStopping(cb) {
    await this.#makeRequest(
      { requestType: 'server-stopping' },
      `${this.#url}/internal/brokerservers/${this.#id}`,
      'delete',
      cb,
    );
  }

  async clientConnected(
    token,
    clientId,
    clientVersion,
    requestType = 'client-connected',
    time = -1,
  ) {
    const hashedToken = hashToken(token);
    const url = new URL(
      `${this.#url}/internal/brokerservers/${
        this.#id
      }/connections/${hashedToken}`,
    );
    if (clientId) {
      url.searchParams.append('broker_client_id', clientId);
    }
    if (time != -1) {
      url.searchParams.append('latency', `${Date.now() - time}`);
    }
    url.searchParams.append('request_type', requestType);

    await this.#makeRequest(
      { hashedToken, clientId, requestType: requestType },
      url.toString(),
      'post',
      {
        data: {
          attributes: {
            health_check_link: `http://${this.#hostname}/healthcheck`,
            broker_client_version: `${clientVersion}`,
          },
        },
      },
    );
  }

  async clientDisconnected(token, clientId) {
    const hashedToken = hashToken(token);
    await this.#makeRequest(
      { hashedToken, clientId, requestType: 'client-disconnected' },
      `${this.#url}/internal/brokerservers/${
        this.#id
      }/connections/${hashedToken}${
        clientId ? `?broker_client_id=${clientId}` : ''
      }`,
      'delete',
    );
  }

  async #makeRequest(logContext, url, method, requestBody?, cb?) {
    const requestId = uuidv4();
    // version *must* be provided
    const urlWithVersion = new URL(url);
    urlWithVersion.searchParams.append('version', this.#version);
    url = urlWithVersion.toString();
    try {
      const response = await axiosInstance.request({
        url,
        method,
        data: requestBody && JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/vnd.api+json',
          Connection: 'Keep-Alive',
          'Keep-Alive': 'timeout=60, max=10',
          'Snyk-Request-Id': requestId,
        },
      });
      const statusCode = response.status;
      const headers = response.headers;
      const body = response.data;
      if (statusCode >= 300) {
        logger.error(
          {
            ...logContext,
            requestId,
            statusCode,
            headers,
            body,
            dispatcherUrl: this.#url,
            dispatcherVersion: this.#version,
            serverId: this.#id,
          },
          'received unexpected status code communicating with Dispatcher',
        );
        incrementDispatcherWrite(this.#target, 'failure');
      } else {
        logger.trace(
          { ...logContext, serverId: this.#id, requestId },
          'successfully sent request to Dispatcher',
        );
        incrementDispatcherWrite(this.#target, 'success');
      }
    } catch (e: any) {
      logger.error(
        {
          ...logContext,
          requestId,
          errorMessage: e.message,
          stackTrace: new Error('stack generator').stack,
          dispatcherUrl: this.#url,
          dispatcherVersion: this.#version,
          serverId: this.#id,
        },
        'received error communicating with Dispatcher',
      );
      incrementDispatcherWrite(this.#target, 'failure');
    }

    if (cb) cb();
  }
}

export let clientConnected;
export let clientPinged;
export let clientDisconnected;
export let serverStarting;
export let serverStopping;

const config = getConfig();

if (config.dispatcherUrl) {
  const serverId = config.hostname?.substring(
    config.hostname?.lastIndexOf('-') + 1,
  );

  const kc = new DispatcherClient(
    config.dispatcherUrl,
    config.hostname,
    serverId,
    config.dispatcherVersion,
    'node-dispatcher',
  );

  // Optional dual-write to the broker-gateway (Go) dispatcher. When
  // GATEWAY_DISPATCHER_URL is set, each lifecycle event is mirrored so the new
  // dispatcher's Redis state matches the primary, enabling an eventual read-path
  // cutover. Same server id/hostname keeps the mirrored state identical; the
  // version defaults to the primary's and only needs overriding if the two
  // dispatchers' API versions ever diverge.
  const gatewayClient = config.gatewayDispatcherUrl
    ? new DispatcherClient(
        config.gatewayDispatcherUrl,
        config.hostname,
        serverId,
        config.gatewayDispatcherVersion || config.dispatcherVersion,
        'envoy-dispatcher',
      )
    : undefined;

  // The mirror is fire-and-forget: we never await it on the primary path, so a
  // slow or unhealthy gateway cannot add latency to (or fail) the primary write.
  // DispatcherClient already swallows its own errors, so the promise resolves
  // even on failure; the guard catch is belt-and-braces against a synchronous
  // throw (e.g. URL construction) becoming an unhandledRejection.
  const mirror = (write?: Promise<void>) => {
    void write?.catch(() => {});
  };

  clientConnected = async function (token, clientId, clientVersion) {
    mirror(gatewayClient?.clientConnected(token, clientId, clientVersion));
    await kc.clientConnected(token, clientId, clientVersion);
  };

  clientPinged = async function (token, clientId, clientVersion, time) {
    mirror(
      gatewayClient?.clientConnected(
        token,
        clientId,
        clientVersion,
        'client-pinged',
        time,
      ),
    );
    await kc.clientConnected(
      token,
      clientId,
      clientVersion,
      'client-pinged',
      time,
    );
  };

  clientDisconnected = async function (token, clientId) {
    mirror(gatewayClient?.clientDisconnected(token, clientId));
    await kc.clientDisconnected(token, clientId);
  };

  serverStarting = async function () {
    mirror(gatewayClient?.serverStarting());
    await kc.serverStarting();
  };

  serverStopping = async function (cb) {
    // Primary owns the shutdown callback; mirror with a no-op so the gateway
    // write cannot influence shutdown.
    mirror(gatewayClient?.serverStopping(() => {}));
    await kc.serverStopping(cb);
  };
} else {
  logger.error(
    'DISPATCHER_URL not set - creating no-op functions to ensure server still functions.',
  );
  clientConnected = async function () {
    logger.trace('Client connected - no-op instead of notifying dispatcher.');
  };

  clientPinged = async function () {
    logger.trace('Client pinged - no-op instead of notifying dispatcher.');
  };

  clientDisconnected = async function () {
    logger.trace(
      'Client disconnected - no-op instead of notifying dispatcher.',
    );
  };

  serverStarting = async function () {
    logger.info('Server started - no-op instead of notifying dispatcher.');
  };

  serverStopping = async function (cb) {
    logger.info('Server stopping - no-op instead of notifying dispatcher.');
    cb();
  };
}
