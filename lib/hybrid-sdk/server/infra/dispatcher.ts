import { hashToken } from '../../common/utils/token';
import { log as logger } from '../../../logs/logger';
import { getConfig } from '../../common/config/config';

import { v4 as uuid } from 'uuid';
import { axiosInstance } from '../../http/axios';

class DispatcherClient {
  #url: string;
  #hostname: string;
  #id: number;
  #version: string;

  constructor(url: string, hostname: string, id?: number, version?: string) {
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

  async serverStopping(cb?: () => void) {
    await this.#makeRequest(
      { requestType: 'server-stopping' },
      `${this.#url}/internal/brokerservers/${this.#id}`,
      'delete',
      cb,
    );
  }

  async clientConnected(
    token: string,
    clientId: string | undefined,
    clientVersion: string,
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

  async clientDisconnected(token: string, clientId: string) {
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

  async #makeRequest(
    logContext: Record<string, unknown>,
    url: string,
    method: string,
    requestBody?: unknown,
    cb?: () => void,
  ) {
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
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      logger.error(
        {
          ...logContext,
          requestId,
          errorMessage,
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

export let clientConnected: (
  token: string,
  clientId: string | undefined,
  clientVersion: string,
) => void;
export let clientPinged: (
  token: string,
  clientId: string | undefined,
  clientVersion: string,
  time: number,
) => void;
export let clientDisconnected: (token: string, clientId: string) => void;
export let serverStarting: () => void;
export let serverStopping: (cb: () => void) => void;

const config = getConfig();

if (config.dispatcherUrl) {
  const kc = new DispatcherClient(
    config.dispatcherUrl,
    config.hostname,
    config.hostname?.substring(config.hostname?.lastIndexOf('-') + 1),
    config.dispatcherVersion,
  );

  clientConnected = async function (
    token: string,
    clientId: string | undefined,
    clientVersion: string,
  ) {
    return kc.clientConnected(token, clientId, clientVersion);
  };

  clientPinged = async function (
    token: string,
    clientId: string | undefined,
    clientVersion: string,
    time: number,
  ) {
    return kc.clientConnected(
      token,
      clientId,
      clientVersion,
      'client-pinged',
      time,
    );
  };

  clientDisconnected = async function (token: string, clientId: string) {
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
