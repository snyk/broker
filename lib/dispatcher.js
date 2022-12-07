const { maskToken } = require('./token');
const logger = require('./log');
const config = require('./config');
const crypto = require('crypto');
let request = require('request');
request = request.defaults({
  timeout: 60000,
  agentOptions: { keepAlive: true, keepAliveMsecs: 60000, maxTotalSockets: 10 },
});

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

  serverStarting() {
    this.#makeRequest(
      { requestType: 'server-starting' },
      `${this.#url}/internal/brokerservers/${this.#id}`,
      'post',
      { health_check_link: `http://${this.#hostname}/healthcheck` },
    );
  }

  serverStopping(cb) {
    this.#makeRequest(
      { requestType: 'server-stopping' },
      `${this.#url}/internal/brokerservers/${this.#id}`,
      'delete',
      cb,
    );
  }

  clientConnected(token, clientId) {
    const maskedToken = maskToken(token);
    this.#makeRequest(
      { maskedToken, clientId, requestType: 'client-connected' },
      `${this.#url}/internal/brokerservers/${this.#id}/connections/${hash(
        token,
      )}${clientId ? `?brokerClientId=${clientId}` : ''}`,
      'post',
      { health_check_link: `http://${this.#hostname}/healthcheck` },
    );
  }

  clientDisconnected(token, clientId) {
    const maskedToken = maskToken(token);
    this.#makeRequest(
      { maskedToken, clientId, requestType: 'client-disconnected' },
      `${this.#url}/internal/brokerservers/${this.#id}/connections/${hash(
        token,
      )}${clientId ? `?brokerClientId=${clientId}` : ''}`,
      'delete',
    );
  }

  #makeRequest(logContext, url, method, requestBody, cb) {
    // version *must* be provided
    url = `${url}?version=${this.#version}`;
    let body = '';
    let statusCode = -1;
    let headers = {};
    request({
      url,
      method,
      headers: {
        'Content-Type': 'application/json',
        Connection: 'Keep-Alive',
        'Keep-Alive': 'timeout=60, max=10',
      },
      body: JSON.stringify(requestBody),
    })
      .on('error', (e) => {
        logger.error(
          {
            ...logContext,
            error: e,
            dispatcherUrl: this.#url,
            dispatcherVersion: this.#version,
            id: this.#id,
          },
          'received error communicating with Dispatcher',
        );
        if (cb) cb();
      })
      .on('response', (r) => {
        statusCode = r.statusCode;
        headers = r.headers;
      })
      .on('data', (d) => {
        body += d.toString();
      })
      .on('end', () => {
        if (statusCode >= 300) {
          logger.error(
            {
              ...logContext,
              statusCode,
              headers,
              body,
              dispatcherUrl: this.#url,
              dispatcherVersion: this.#version,
              id: this.#id,
            },
            'received unexpected status code communicating with Dispatcher',
          );
        } else {
          logger.trace(
            { ...logContext, id: this.#id },
            'successfully sent request to Dispatcher',
          );
        }
        if (cb) cb();
      });
  }
}

function hash(token) {
  const shasum = crypto.createHash('sha256');
  shasum.update(token);
  return shasum.digest('hex');
}

let clientConnected;
let clientDisconnected;
let serverStarting;
let serverStopping;

if (config.dispatcherUrl) {
  const kc = new DispatcherClient(
    config.dispatcherUrl,
    config.hostname,
    config.hostname?.substring(config.hostname?.lastIndexOf('-')),
    config.dispatcherVersion,
  );

  clientConnected = function (token, clientId) {
    kc.clientConnected(token, clientId);
  };

  clientDisconnected = function (token, clientId) {
    kc.clientDisconnected(token, clientId);
  };

  serverStarting = function () {
    kc.serverStarting();
  };

  serverStopping = function (cb) {
    kc.serverStopping(cb);
  };
} else {
  logger.error(
    'DISPATCHER_URL not set - creating no-op functions to ensure Server still functions',
  );
  clientConnected = function () {
    logger.trace('client connected - no-op instead of notifying dispatcher');
  };

  clientDisconnected = function () {
    logger.trace('client disconnected - no-op instead of notifying dispatcher');
  };

  serverStarting = function () {
    logger.info('server started - no-op instead of notifying dispatcher');
  };

  serverStopping = function (cb) {
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
