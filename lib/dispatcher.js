const { hashToken } = require('./token');
const logger = require('./log');
const config = require('./config');
const { axiosInstance } = require('./axios');
const { v4: uuid } = require('uuid');

class DispatcherClient {
  #url;
  #hostname;
  #id;
  #version;

  constructor(url, hostname, id, version) {
    this.#url = url;
    this.#hostname = hostname;
    this.#id = id || 0;
    this.#version = version || '2022-12-02~experimental';
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
      url.searchParams.append('latency', Date.now() - time);
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

  async #makeRequest(logContext, url, method, requestBody, cb) {
    const requestId = uuid();
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
      } else {
        logger.trace(
          { ...logContext, serverId: this.#id, requestId },
          'successfully sent request to Dispatcher',
        );
      }
    } catch (e) {
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
    }

    if (cb) cb();
  }
}

let clientConnected;
let clientPinged;
let clientDisconnected;
let serverStarting;
let serverStopping;

if (config.dispatcherUrl) {
  const kc = new DispatcherClient(
    config.dispatcherUrl,
    config.hostname,
    config.hostname?.substring(config.hostname?.lastIndexOf('-') + 1),
    config.dispatcherVersion,
  );

  clientConnected = async function (token, clientId, clientVersion) {
    return kc.clientConnected(token, clientId, clientVersion);
  };

  clientPinged = async function (token, clientId, clientVersion, time) {
    return kc.clientConnected(
      token,
      clientId,
      clientVersion,
      'client-pinged',
      time,
    );
  };

  clientDisconnected = async function (token, clientId) {
    return kc.clientDisconnected(token, clientId);
  };

  serverStarting = async function () {
    return kc.serverStarting();
  };

  serverStopping = async function (cb) {
    return kc.serverStopping(cb);
  };
} else {
  logger.error(
    'DISPATCHER_URL not set - creating no-op functions to ensure Server still functions',
  );
  clientConnected = async function () {
    logger.trace('client connected - no-op instead of notifying dispatcher');
  };

  clientPinged = async function () {
    logger.trace('client pinged - no-op instead of notifying dispatcher');
  };

  clientDisconnected = async function () {
    logger.trace('client disconnected - no-op instead of notifying dispatcher');
  };

  serverStarting = async function () {
    logger.info('server started - no-op instead of notifying dispatcher');
  };

  serverStopping = async function (cb) {
    logger.info('server stopping - no-op instead of notifying dispatcher');
    cb();
  };
}

module.exports = {
  clientConnected,
  clientPinged,
  clientDisconnected,
  serverStarting,
  serverStopping,
};
