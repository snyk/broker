const { hashToken, maskToken } = require('./token');
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

  async clientConnected(token, clientId, clientVersion) {
    const maskedToken = maskToken(token);
    await this.#makeRequest(
      { maskedToken, clientId, requestType: 'client-connected' },
      `${this.#url}/internal/brokerservers/${this.#id}/connections/${hashToken(
        token,
      )}${clientId ? `?broker_client_id=${clientId}` : ''}`,
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
    const maskedToken = maskToken(token);
    await this.#makeRequest(
      { maskedToken, clientId, requestType: 'client-disconnected' },
      `${this.#url}/internal/brokerservers/${this.#id}/connections/${hashToken(
        token,
      )}${clientId ? `?broker_client_id=${clientId}` : ''}`,
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
  clientDisconnected,
  serverStarting,
  serverStopping,
};
