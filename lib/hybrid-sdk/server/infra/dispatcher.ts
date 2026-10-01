import { hashToken } from '../../common/utils/token';
import { log as logger } from '../../../logs/logger';
import { getConfig } from '../../common/config/config';

import { uuidv4 } from '../../common/utils/uuid';
import { axiosInstance } from '../../http/axios';
import { incrementDispatcherWrite } from '../../common/utils/metrics';

// Both dispatchers' internal APIs validate the `version` query param against
// the single version they serve, so it is fixed rather than configurable.
const DISPATCHER_API_VERSION = '2022-12-02~experimental';

class DispatcherClient {
  #url;
  #hostname;
  #id;
  #target;

  // `target` labels the dispatcher this client writes to for the broker_dispatcher_write_total metric.
  constructor(url, hostname, id, target) {
    this.#url = url;
    this.#hostname = hostname;
    this.#id = id || 0;
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
      undefined,
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
    urlWithVersion.searchParams.append('version', DISPATCHER_API_VERSION);
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

// Lifecycle writes go to exactly ONE dispatcher; there is no dual write.
//
// - DISPATCHER_URL set: the legacy node dispatcher. Kept only for environments
//   where the broker-gateway dispatcher is not deployed (FedRAMP). It registers
//   the bare pod ordinal ("broker-server-3" -> "3") as its server id.
// - Otherwise GATEWAY_DISPATCHER_URL: the broker-gateway (envoy) dispatcher, the
//   default. It registers the FULL pod name (config.hostname) as its server id,
//   so the envoy sidecar can resolve the exact pod FQDN from Redis alone.
//
// DISPATCHER_URL wins when both are set: it is an explicit per-environment
// opt-out, and writing to both would reintroduce dual-write drift.
const selectDispatcher = (): DispatcherClient | undefined => {
  if (config.dispatcherUrl) {
    if (config.gatewayDispatcherUrl) {
      logger.warn(
        { dispatcherUrl: config.dispatcherUrl },
        'Both DISPATCHER_URL and GATEWAY_DISPATCHER_URL set - registering with the node dispatcher only.',
      );
    }
    const serverId = config.hostname?.substring(
      config.hostname?.lastIndexOf('-') + 1,
    );
    return new DispatcherClient(
      config.dispatcherUrl,
      config.hostname,
      serverId,
      'node-dispatcher',
    );
  }
  if (config.gatewayDispatcherUrl) {
    return new DispatcherClient(
      config.gatewayDispatcherUrl,
      config.hostname,
      config.hostname,
      'envoy-dispatcher',
    );
  }
  return undefined;
};

const dispatcherClient = selectDispatcher();

if (dispatcherClient) {
  clientConnected = async function (token, clientId, clientVersion) {
    await dispatcherClient.clientConnected(token, clientId, clientVersion);
  };

  clientPinged = async function (token, clientId, clientVersion, time) {
    await dispatcherClient.clientConnected(
      token,
      clientId,
      clientVersion,
      'client-pinged',
      time,
    );
  };

  clientDisconnected = async function (token, clientId) {
    await dispatcherClient.clientDisconnected(token, clientId);
  };

  serverStarting = async function () {
    await dispatcherClient.serverStarting();
  };

  serverStopping = async function (cb) {
    await dispatcherClient.serverStopping(cb);
  };
} else {
  logger.error(
    'Neither DISPATCHER_URL nor GATEWAY_DISPATCHER_URL set - creating no-op functions to ensure server still functions.',
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
