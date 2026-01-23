import { log as globalLogger } from '../../logs/logger';
import stream from 'stream';
import { pipeline } from 'stream/promises';

import version from '../common/utils/version';

import { getProxyForUrl } from 'proxy-from-env';
import { bootstrap } from 'global-agent';
import https from 'https';
import http from 'http';

import { getAuthConfig } from '../client/auth/oauth';
import { addServerIdAndRoleQS } from './utils';
import { getConfig } from '../common/config/config';
import type { ExtendedLogContext } from '../common/types/log';
import { replaceUrlPartialChunk } from '../common/utils/replace-vars';

const BROKER_CONTENT_TYPE = 'application/vnd.broker.stream+octet-stream';

const client = getConfig().brokerServerUrl?.startsWith('https') ? https : http;

if (process.env.HTTP_PROXY || process.env.http_proxy) {
  process.env.HTTP_PROXY = process.env.HTTP_PROXY || process.env.http_proxy;
}
if (process.env.HTTPS_PROXY || process.env.https_proxy) {
  process.env.HTTPS_PROXY = process.env.HTTPS_PROXY || process.env.https_proxy;
}
if (process.env.NO_PROXY || process.env.no_proxy) {
  process.env.NO_PROXY = process.env.NO_PROXY || process.env.no_proxy;
}
const proxyUri = getProxyForUrl(getConfig().brokerServerUrl);
if (proxyUri) {
  bootstrap({
    environmentVariableNamespace: '',
  });
}

interface Logger {
  debug(message: string): void;
  debug(
    context: Partial<ExtendedLogContext> & Record<string, any>,
    message: string,
  ): void;
  error(message: string): void;
  error(
    context: Partial<ExtendedLogContext> & Record<string, any>,
    message: string,
  ): void;
  child(context: Partial<ExtendedLogContext> & Record<string, any>): Logger;
}

/**
 * Handles sending HTTP responses back to the Broker Server via POST requests.
 * Supports both streaming and non-streaming response modes.
 *
 * Note: The logContext parameter is used both for logging and for setting HTTP request headers
 * (e.g., actingOrgPublicId -> 'Snyk-acting-org-public-id', productLine -> 'Snyk-product-line').
 */
class BrokerServerPostResponseHandler {
  #buffer: stream.PassThrough;
  #brokerTransformer;
  #logContext: ExtendedLogContext;
  #config;
  #brokerToken: string;
  #streamingId?: string;
  #serverId;
  #role;
  #requestId: string;
  #brokerSrvPostRequestHandler?: http.ClientRequest;
  #logger: Logger;

  /**
   * Creates a new handler for posting responses to the Broker Server.
   * @param logContext - Logging context with request metadata
   * @param config - Broker configuration
   * @param brokerToken - Token identifying the broker connection
   * @param serverId - Server identifier
   * @param requestId - Unique request identifier
   * @param role - Broker role
   * @param logger - Optional logger instance (defaults to global logger)
   */
  constructor(
    logContext: ExtendedLogContext,
    config,
    brokerToken: string,
    serverId,
    requestId: string,
    role,
    logger: Logger = globalLogger,
  ) {
    this.#logger = logger.child({ ...logContext, requestId });
    this.#logContext = logContext;
    this.#config = config;
    this.#brokerToken = brokerToken;
    this.#serverId = serverId;
    this.#role = role;
    this.#requestId = requestId;
    this.#buffer = new stream.PassThrough({ highWaterMark: 1048576 }); // 1MB
    this.#buffer.on('error', (e) =>
      this.#logger.error(
        {
          errorDetails: e,
          stackTrace: new Error('stacktrace generator').stack,
        },
        'received error sending data to broker server post request buffer',
      ),
    );
  }

  async #initHttpClientRequest() {
    try {
      const backendHostname =
        this.#config.universalBrokerEnabled && this.#config.universalBrokerGa
          ? `${this.#config.brokerServerUrl}/hidden/brokers`
          : `${this.#config.brokerServerUrl}`;

      let url = new URL(
        `${backendHostname}/response-data/${this.#brokerToken}/${
          this.#streamingId
        }`,
      );

      url = addServerIdAndRoleQS(url, this.#serverId, this.#role);

      const brokerServerPostRequestUrl = url.toString();

      const options = {
        method: 'post',
        headers: {
          'Snyk-Request-Id': `${this.#requestId}`,
          'Snyk-acting-org-public-id': `${this.#logContext.actingOrgPublicId}`,
          'Snyk-acting-group-public-id': `${
            this.#logContext.actingGroupPublicId
          }`,
          'Snyk-product-line': `${this.#logContext.productLine}`,
          'Snyk-flow-name': `${this.#logContext.flow}`,
          'Content-Type': BROKER_CONTENT_TYPE,
          Connection: 'close',
          'user-agent': 'Snyk Broker client ' + version,
          'x-broker-client-version': version,
        },
        timeout: this.#config.brokerClientPostTimeout
          ? parseInt(this.#config.brokerClientPostTimeout)
          : 1200000, // ms -> 20 minutes
      };

      const logger = this.#logger.child({
        method: options.method,
        url: brokerServerPostRequestUrl,
      });

      if (getAuthConfig().accessToken && this.#config.universalBrokerGa) {
        options.headers['authorization'] =
          getAuthConfig().accessToken.authHeader;
      }

      this.#brokerSrvPostRequestHandler = client.request(
        brokerServerPostRequestUrl,
        options,
      );

      this.#brokerSrvPostRequestHandler
        .on('error', (e) => {
          logger.error(
            {
              error: e.message,
              errDetails: e,
              stackTrace: new Error('stacktrace generator').stack,
            },
            'received error sending data via POST to Broker Server',
          );
          this.#buffer.end(e.message);
        })
        .on('timeout', () => {
          const timeoutError = new Error(
            'Upstream request to Broker Server timed out',
          );
          // Note: This timeout may fire if upstream or downstream is slow
          // (whichever timeout is shorter). Check buffer state to help diagnose.
          logger.error(
            {
              error: timeoutError.message,
              errDetails: timeoutError,
              timeout: options.timeout,
              buffer: {
                readableLength: this.#buffer.readableLength,
                readableHighWaterMark: this.#buffer.readableHighWaterMark,
                writableLength: this.#buffer.writableLength,
                writableHighWaterMark: this.#buffer.writableHighWaterMark,
              },
              stackTrace: new Error('stacktrace generator').stack,
            },
            'Upstream request to Broker Server timed out',
          );
          this.#brokerSrvPostRequestHandler?.destroy();
          this.#buffer.end(timeoutError.message);
        })
        .on('response', async (r) => {
          r.on('error', async (err) => {
            logger.error(
              {
                error: err.message,
                errDetails: err,
                stackTrace: new Error('stacktrace generator').stack,
              },
              'Stream Response error in POST to Broker Server',
            );
          });
          if (r.statusCode !== 200) {
            const body = await readBody(r).catch(() => '');
            logger.error(
              {
                responseStatus: r.statusCode?.toString(),
                error: body,
                responseHeaders: JSON.stringify(r.headers),
                statusMessage: r.statusMessage,
                stackTrace: new Error('stacktrace generator').stack,
              },
              'Received unexpected HTTP response POSTing data to Broker Server',
            );
          }
        })
        .on('finish', () => {
          logger.debug('Finish Post Request Handler Event');
        })
        .on('close', () => {
          logger.debug('Close Post Request Handler Event');
        });

      logger.debug('POST Request Client setup');
    } catch (err) {
      this.#logger.error(
        { errorDetails: err },
        'Error init Client for POST Broker Server Stream',
      );
    }
  }

  #sendIoData(ioData) {
    const ioDataLength = ioData.length;
    this.#logger.debug(
      { ioDataLength },
      `sending ioData (Status & Headers) to Broker Server`,
    );
    // Would be nice if there were a Unit32Array or a writeUint32 method, but noooooo...
    const ioDataLengthBinary = new Uint8Array(4);
    ioDataLengthBinary[0] = ioDataLength & 0xff;
    ioDataLengthBinary[1] = (ioDataLength >> 8) & 0xff;
    ioDataLengthBinary[2] = (ioDataLength >> 16) & 0xff;
    ioDataLengthBinary[3] = (ioDataLength >> 24) & 0xff;
    this.#buffer.cork();
    this.#buffer.write(ioDataLengthBinary);
    this.#buffer.write(ioData);
    this.#buffer.uncork();
  }

  #handleRequestError() {
    // For reasons unknown, doing foo.on(this.#func)
    // doesn't work - you need return a function from here
    return (error: Error) => {
      this.#logger.error(
        {
          errorDetails: error,
          stackTrace: new Error('stacktrace generator').stack,
        },
        'received error from downstream request while streaming data to Broker Server',
      );
      // If we already have a buffer object, then we've already started sending data back to the original requestor,
      // so we have to destroy the stream and let that flow through the system
      // If we *don't* have a buffer object, then there was a major failure with the request (e.g., host not found), so
      // we will forward that directly to the Broker Server
      if (this.#buffer) {
        this.#buffer.end(error.message);
      } else {
        const body = JSON.stringify({ error: error });
        this.#sendIoData(
          JSON.stringify({
            status: 500,
            headers: {
              'Content-Length': `${body.length}`,
              'Content-Type': 'application/json',
            },
          }),
        );
      }
    };
  }

  /**
   * Streams a downstream HTTP response back to the Broker Server.
   * Sends status/headers first, then streams the response body.
   * @param response - The incoming HTTP response to forward
   * @param streamingID - Unique identifier for this streaming request
   */
  async forwardRequest(response: http.IncomingMessage, streamingID) {
    const config = this.#config;
    try {
      this.#streamingId = streamingID;
      let prevPartialChunk;
      response.socket.on('error', (err) => {
        this.#logger.error(
          {
            error: err.message,
            errDetails: err,
            stackTrace: new Error('stacktrace generator').stack,
          },
          'Socket Response error in Streaming from downstream',
        );
      });
      response.socket.on('timeout', () => {
        const timeoutError = new Error('Downstream response socket timed out');
        // Note: This timeout may fire if downstream or upstream is slow
        // (whichever timeout is shorter). Check buffer state to help diagnose.
        this.#logger.error(
          {
            error: timeoutError.message,
            errDetails: timeoutError,
            buffer: {
              readableLength: this.#buffer.readableLength,
              readableHighWaterMark: this.#buffer.readableHighWaterMark,
              writableLength: this.#buffer.writableLength,
              writableHighWaterMark: this.#buffer.writableHighWaterMark,
            },
            stackTrace: new Error('stacktrace generator').stack,
          },
          'Downstream response socket timed out',
        );
        response.socket?.destroy();
        this.#buffer.end(timeoutError.message);
      });
      const status = response?.statusCode || 500;
      this.#logger.debug(
        {
          responseStatus: status.toString(),
        },
        'response received, setting up stream to Broker Server',
      );
      const isResponseJson = isJson(response.headers);
      const ioData = JSON.stringify({
        status,
        headers: response.headers,
      });
      await this.#initHttpClientRequest();
      this.#sendIoData(ioData);
      this.#logger.debug('successfully sent status & headers to Broker Server');
      // TODO: break into 2 distinct transform, only to add to pipeline if conditions are met
      // Take out of here if possible
      this.#logger.debug('Setting up transformers');
      const logger = this.#logger;
      this.#brokerTransformer = new stream.Transform({
        transform(chunk, encoding, callback) {
          const httpBody =
            config && config.LOG_ENABLE_BODY === 'true'
              ? { body: chunk.toString() }.body
              : null;
          logger.debug(
            { chunkLength: chunk.length, httpBody },
            'writing data to buffer',
          );
          if (config.RES_BODY_URL_SUB && isResponseJson) {
            const { newChunk, partial } = replaceUrlPartialChunk(
              Buffer.from(chunk).toString(),
              prevPartialChunk,
              config,
            );
            prevPartialChunk = partial;
            chunk = newChunk;
          }
          callback(null, chunk);
        },
      });
      response.on('error', this.#handleRequestError());

      if (
        (config && config.LOG_ENABLE_BODY === 'true') ||
        (config.RES_BODY_URL_SUB && isResponseJson)
      ) {
        this.#logger.debug('Pipelining with body logging on or Body replace ');
        await pipeline(
          response,
          this.#buffer,
          this.#brokerTransformer,
          this.#brokerSrvPostRequestHandler!, // initialized in #initHttpClientRequest above
        );
      } else {
        this.#logger.debug('Pipelining standard');
        await pipeline(
          response,
          this.#buffer,
          this.#brokerSrvPostRequestHandler!, // initialized in #initHttpClientRequest above
        );
      }
    } catch (err) {
      this.#logger.error(
        { errorDetails: err },
        'Error in forwarding the request to broker server pipeline',
      );
    }
  }

  /**
   * Sends a complete response (status, headers, body) back to the Broker Server.
   * Used for non-streaming, internally generated responses.
   * @param responseData - Response object containing status, headers, and body
   * @param streamingID - Unique identifier for this request
   */
  async sendData(responseData, streamingID) {
    this.#streamingId = streamingID;
    const body = responseData.body;
    delete responseData.body;
    this.#logger.debug(
      { responseData, body },
      'posting internal response back to Broker Server as it is expecting streaming response',
    );
    await this.#initHttpClientRequest();
    pipeline(this.#buffer, this.#brokerSrvPostRequestHandler!); // initialized in #initHttpClientRequest above
    this.#sendIoData(JSON.stringify(responseData));
    this.#buffer.write(JSON.stringify(body));
    this.#buffer.end();
  }
}

function isJson(responseHeaders) {
  return responseHeaders['content-type']?.includes('json') || false;
}

function readBody(response: http.IncomingMessage): Promise<string> {
  const bodyChunks: Buffer[] = [];

  return new Promise((resolve, reject) => {
    response.on('data', (chunk) => {
      bodyChunks.push(chunk);
    });

    response.on('end', () => {
      resolve(Buffer.concat(bodyChunks).toString());
    });

    response.on('error', (err) => {
      reject(err);
    });
  });
}

export { BrokerServerPostResponseHandler };
